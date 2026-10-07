/** Shared setup for the testnet scripts: deployments, passkey businesses and the signing flow. */
import { readFileSync } from "node:fs";
import { Address, Asset, Keypair, Operation, hash, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient, type Clearing } from "@nodus/contract-client";
import { ACCOUNT_WASM_HASH, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, defaultRuleIds, entryAddress, relay } from "@nodus/stellar";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { SoftwarePasskey } from "./software-passkey.ts";
import { addressVal, buildTransaction, confirm, read, sendAndConfirm, server, submit } from "./testnet.ts";

const RP_ID = "nodus.example";
const ORIGIN = `https://${RP_ID}`;
const WASM_PATH = new URL("../../../target/wasm32v1-none/release/nodus.wasm", import.meta.url);

/** The token has 7 decimals. */
export const UNIT = 10_000_000n;

export const log = (message: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
export const units = (amount: bigint) => `${amount / UNIT}`;

export interface World {
  /** Deploys everything and pays the fees that the relayer does not. */
  operator: Keypair;
  token: string;
  nodus: NodusClient;
  nodusId: string;
  /** Ledger in which the contract was created: where its events begin. */
  deployLedger: number;
}

export interface Business {
  name: string;
  address: string;
  kit: SmartAccountKit;
}

/** A fresh operator, test token and Nodus contract on testnet. */
export async function deployWorld(): Promise<World> {
  const operator = Keypair.random();
  await server.requestAirdrop(operator.publicKey());
  log(`Operator ${operator.publicKey()} funded`);

  const asset = new Asset("USDC", operator.publicKey());
  await submit(operator, Operation.createStellarAssetContract({ asset }));
  const token = asset.contractId(NETWORK_PASSPHRASE);
  log(`Test token ${token}`);

  const wasm = readFileSync(WASM_PATH);
  await submit(operator, Operation.uploadContractWasm({ wasm }));
  const deployment = await submit(
    operator,
    Operation.createCustomContract({
      address: Address.fromString(operator.publicKey()),
      wasmHash: hash(wasm),
      constructorArgs: [addressVal(token)],
    }),
  );
  const nodusId = Address.fromScVal(deployment.returnValue!).toString();
  log(`Nodus contract ${nodusId}`);

  const nodus = new NodusClient({
    contractId: nodusId,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: operator.publicKey(),
  });
  return { operator, token, nodus, nodusId, deployLedger: deployment.ledger };
}

/** A business with a passkey smart account, holding `funds` of the test token. */
export async function createBusiness(world: World, name: string, funds = 0n): Promise<Business> {
  const kit = new SmartAccountKit({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    accountWasmHash: ACCOUNT_WASM_HASH,
    webauthnVerifierAddress: WEBAUTHN_VERIFIER,
    deployerSecret: world.operator.secret(),
    storage: new MemoryStorage(),
    rpId: RP_ID,
    allowedOrigins: [ORIGIN],
    indexerUrl: false,
    webAuthn: new SoftwarePasskey(RP_ID, ORIGIN),
  });
  const wallet = await kit.createWallet("Nodus", name, { autoSubmit: true, forceMethod: "rpc" });
  if (!wallet.submitResult?.success) {
    throw new Error(`Could not deploy the account of ${name}: ${wallet.submitResult?.error.message}`);
  }
  const business = { name, address: wallet.contractId, kit };

  if (funds > 0n) {
    const args = [addressVal(business.address), nativeToScVal(funds, { type: "i128" })];
    await submit(world.operator, Operation.invokeContractFunction({ contract: world.token, function: "mint", args }));
  }
  log(`${name}: ${business.address}`);
  return business;
}

export const balance = (world: World, business: Business) =>
  read<bigint>(world.operator, world.token, "balance", [addressVal(business.address)]);

/** The business signs with its passkey; the operator only pays the fee. */
async function signAndSubmit(business: Business, tx: Parameters<SmartAccountKit["signAndSubmit"]>[0]) {
  const result = await business.kit.signAndSubmit(tx, { forceMethod: "rpc", resolveContextRuleIds: defaultRuleIds });
  if (!result.success) throw new Error(`${business.name}: ${result.error.message}`);
}

/** The creditor registers the debt and, unless told otherwise, the debtor accepts it. Returns its id. */
export async function owe(world: World, debtor: Business, creditor: Business, amount: bigint, accept = true) {
  const registration = await world.nodus.register({ creditor: creditor.address, debtor: debtor.address, amount });
  const id = registration.result.unwrap();
  await signAndSubmit(creditor, registration);
  if (accept) await signAndSubmit(debtor, await world.nodus.accept({ id }));
  log(`${debtor.name} owes ${creditor.name} ${units(amount)} (obligation ${id}${accept ? "" : ", not accepted"})`);
  return id;
}

/**
 * Settles `clearings` in one transaction that carries the signature of every
 * party, each produced separately by that party's passkey.
 */
export async function settle(world: World, clearings: Clearing[], businesses: Business[], viaRelayer: boolean) {
  // 1. Simulate without signatures to learn what each party must authorize.
  const draft = await world.nodus.settle({ clearings });
  const operation = draft.built!.operations[0] as Operation.InvokeHostFunction;

  // 2. Each party signs only its own entry.
  const expiration = (await server.getLatestLedger()).sequence + 720;
  const signed: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of draft.simulationData.result.auth) {
    const business = businesses.find((b) => b.address === entryAddress(entry));
    if (!business) throw new Error(`No business for the auth entry of ${entryAddress(entry)}`);
    signed.push(await business.kit.signAuthEntry(entry, { contextRuleIds: defaultRuleIds(entry), expiration }));
  }

  // 3. One transaction carries every signature. The relayer builds and pays
  //    for it; without one the operator does, simulating again so that the
  //    cost of verifying the signatures is accounted for.
  if (viaRelayer) {
    const apiKey = process.env.OZ_CHANNELS_API_KEY;
    if (!apiKey) throw new Error("OZ_CHANNELS_API_KEY is not set (see .env.example)");
    const auth = signed.map((entry) => entry.toXDR("base64"));
    return confirm(await relay(apiKey, operation.func.toXDR("base64"), auth));
  }
  const { operator } = world;
  const unsimulated = await buildTransaction(operator, Operation.invokeHostFunction({ func: operation.func, auth: signed }));
  const simulation = await server.simulateTransaction(unsimulated);
  if (!rpc.Api.isSimulationSuccess(simulation)) throw new Error(`Settlement simulation failed: ${simulation.error}`);
  return sendAndConfirm(rpc.assembleTransaction(unsimulated, simulation).build(), operator);
}
