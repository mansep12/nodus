import "server-only";
import { Account, Address, BASE_FEE, Operation, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import { NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, type PasskeySigner } from "@nodus/stellar";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "@/lib/config";

export const server = new rpc.Server(RPC_URL);

export const nodus = new NodusClient({
  contractId: NODUS_CONTRACT,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
});

/** A source for simulations, which need one but never check that it exists. */
const NOBODY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/** Simulates a contract call that nobody in particular sends. */
export async function simulate(contract: string, fn: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(new Account(NOBODY, "0"), { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.invokeContractFunction({ contract, function: fn, args }))
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
    throw new Error(`${fn} failed: ${"error" in simulation ? simulation.error : "no result"}`);
  }
  return { operation: tx.operations[0] as Operation.InvokeHostFunction, result: simulation.result };
}

export async function tokenBalance(address: string): Promise<bigint> {
  const { result } = await simulate(TOKEN_CONTRACT, "balance", [Address.fromString(address).toScVal()]);
  return scValToNative(result.retval) as bigint;
}

const SIGNER_FRESHNESS_MS = 60_000;
const signers = new Map<string, { signer: PasskeySigner | undefined; readAt: number }>();

/**
 * The passkey a smart account answers to, if the account is set up the way
 * this app sets them up: a default rule with that passkey as its only signer
 * and no policies. Undefined for anything else.
 */
export async function accountSigner(address: string): Promise<PasskeySigner | undefined> {
  const known = signers.get(address);
  if (known && Date.now() - known.readAt < SIGNER_FRESHNESS_MS) return known.signer;

  let rule: {
    context_type: [string];
    policies: unknown[] | Record<string, unknown>;
    signers: Array<[kind: string, verifier: string, keyData: Buffer]>;
  };
  try {
    const { result } = await simulate(address, "get_context_rule", [xdr.ScVal.scvU32(0)]);
    rule = scValToNative(result.retval);
  } catch {
    // Not a smart account, or the network failed: either way, not something to remember.
    return undefined;
  }
  const [only, ...others] = rule.signers;
  const plain = rule.context_type[0] === "Default" && Object.keys(rule.policies).length === 0 && others.length === 0;
  const signer = plain && only?.[0] === "External" && only[1] === WEBAUTHN_VERIFIER ? { verifier: only[1], keyData: only[2] } : undefined;
  signers.set(address, { signer, readAt: Date.now() });
  return signer;
}

const LEDGER_FRESHNESS_MS = 3_000;
let ledger: { sequence: number; readAt: number } | undefined;

/** The latest ledger, at most a few seconds old. */
export async function latestLedger(): Promise<number> {
  if (!ledger || Date.now() - ledger.readAt > LEDGER_FRESHNESS_MS) {
    ledger = { sequence: (await server.getLatestLedger()).sequence, readAt: Date.now() };
  }
  return ledger.sequence;
}
