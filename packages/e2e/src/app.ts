/** A client for a running instance of the web app: what a business does from its browser, done from a script. */
import { xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import type { KitCredential, SessionView, SettlementOption, SigningRequest, StateView } from "@nodus/api";
import { ACCOUNT_WASM_HASH, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, defaultRuleIds } from "@nodus/stellar";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { log, units } from "./harness.ts";
import { SoftwarePasskey } from "./software-passkey.ts";

export interface Business {
  name: string;
  address: string;
  kit: SmartAccountKit;
  passkey: SoftwarePasskey;
  /** The session cookie of the API, once the business entered. */
  cookie: string;
}

export async function connectApp(app: URL) {
  /** Calls the API as `business`, or anonymously. */
  async function api<T>(path: string, body?: unknown, business?: Pick<Business, "cookie"> | null, method?: string): Promise<T> {
    const response = await fetch(new URL(path, app), {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(business?.cookie ? { Cookie: business.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    const cookie = response.headers.get("set-cookie");
    if (cookie && business) business.cookie = cookie.split(";")[0]!;
    return data as T;
  }

  const readState = (business: Business) => api<StateView>("/api/state?fresh=1", undefined, business);

  const { ok } = await api<{ ok: boolean }>("/api/health");
  if (!ok) throw new Error("The app is not healthy");

  /** A kit for one passkey, with its own memory of credentials: one browser. */
  function newKit(passkey: SoftwarePasskey, storage = new MemoryStorage()) {
    return new SmartAccountKit({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: HORIZON_URL,
      accountWasmHash: ACCOUNT_WASM_HASH,
      webauthnVerifierAddress: WEBAUTHN_VERIFIER,
      storage,
      rpId: app.hostname,
      allowedOrigins: [app.origin],
      indexerUrl: false,
      relayerUrl: new URL("/api/relay", app).href,
      webAuthn: passkey,
    });
  }

  /** Opens the API session of `business` with its passkey, as the welcome screen does. */
  async function login(business: Business) {
    const { challenge } = await api<{ challenge: string }>("/api/session/challenge");
    const assertion = await business.passkey.startAuthentication({ optionsJSON: { challenge } });
    const holder = { cookie: "" };
    const view = await api<SessionView>("/api/session", { assertion }, holder);
    business.cookie = holder.cookie;
    return view;
  }

  /** A business creates its account, publishes its passkey and names itself, as on the welcome screen. */
  async function join(name: string): Promise<Business> {
    const passkey = new SoftwarePasskey(app.hostname, app.origin);
    const kit = newKit(passkey);
    const wallet = await kit.createWallet("Nodus", name, { autoSubmit: true });
    if (!wallet.submitResult?.success) throw new Error(`Could not create ${name}: ${wallet.submitResult?.error.message}`);
    const business: Business = { name, address: wallet.contractId, kit, passkey, cookie: "" };

    const stored = (await kit.credentials.getAll()).find((credential) => credential.credentialId === wallet.credentialId)!;
    const record: KitCredential = {
      credentialId: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey).toString("hex"),
      contractId: stored.contractId,
      contextRuleId: 0,
      isPrimary: true,
      label: "script",
      birthWasmHash: stored.birthWasmHash,
      creationTransactionHash: stored.creationTransactionHash,
      creationLedger: stored.creationLedger,
      birthConstructorArgsHash: stored.birthConstructorArgsHash,
    };
    await api("/api/credentials", {
      address: record.contractId,
      credentialId: record.credentialId,
      publicKey: record.publicKey,
      contextRuleId: 0,
      isPrimary: true,
      label: record.label,
      birth: {
        wasmHash: record.birthWasmHash,
        transactionHash: record.creationTransactionHash,
        ledger: record.creationLedger,
        constructorArgsHash: record.birthConstructorArgsHash,
      },
    });
    await login(business);
    await api("/api/businesses", { name }, business);
    log(`${name}: ${wallet.contractId}`);
    return business;
  }

  /** The contract the app runs on, from the state of any business. */
  async function contractOf(business: Business) {
    return (await readState(business)).contract;
  }

  let client: NodusClient | undefined;
  async function nodus(business: Business) {
    return (client ??= new NodusClient({ contractId: await contractOf(business), rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }));
  }

  async function send(business: Business, transaction: Parameters<SmartAccountKit["signAndSubmit"]>[0]) {
    const result = await business.kit.signAndSubmit(transaction, { resolveContextRuleIds: defaultRuleIds });
    if (!result.success) throw new Error(`${business.name}: ${result.error.message}`);
  }

  /** The debtor accepts a debt registered against it. */
  const accept = async (debtor: Business, id: bigint) => send(debtor, await (await nodus(debtor)).accept({ id }));

  /** The debtor pays part of an accepted debt directly. */
  const pay = async (debtor: Business, id: bigint, amount: bigint) => send(debtor, await (await nodus(debtor)).pay({ id, amount }));

  /** The creditor records that the account at `debtor` owes it `amount`. Returns the id of the debt. */
  async function register(debtor: string, creditor: Business, amount: bigint, due?: Date): Promise<bigint> {
    const registration = await (
      await nodus(creditor)
    ).register({
      creditor: creditor.address,
      debtor,
      amount,
      reference: undefined,
      due: due ? BigInt(Math.floor(due.getTime() / 1000)) : undefined,
    });
    const id = registration.result.unwrap();
    await send(creditor, registration);
    return id;
  }

  /** The creditor registers the debt and the debtor accepts it. Returns its id. */
  async function owe(debtor: Business, creditor: Business, amount: bigint): Promise<string> {
    const id = await register(debtor.address, creditor, amount);
    await accept(debtor, id);
    log(`${debtor.name} owes ${creditor.name} ${units(amount)} (obligation ${id})`);
    return id.toString();
  }

  /** The business signs its part of a settlement, as the "Firmar" button does. */
  async function sign(option: SettlementOption, business: Business) {
    const request = await api<SigningRequest>("/api/proposals", { clearings: option.clearings }, business);
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64");
    const signed = await business.kit.signAuthEntry(entry, {
      contextRuleIds: defaultRuleIds(entry),
      expiration: request.expirationLedger,
    });
    await api(`/api/proposals/${request.proposalId}/signatures`, { signedEntry: signed.toXDR("base64") }, business);
    log(`${business.name} signed`);
  }

  return { api, readState, join, login, register, accept, pay, owe, sign, newKit };
}
