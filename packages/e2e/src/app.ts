/** A client for a running instance of the web app: what a business does from its browser, done from a script. */
import { xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import { ACCOUNT_WASM_HASH, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, defaultRuleIds } from "@nodus/stellar";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import type { SettlementOption, SigningRequest, StateView } from "@nodus/api";
import { log, units } from "./harness.ts";
import { SoftwarePasskey } from "./software-passkey.ts";

export interface Business {
  name: string;
  address: string;
  kit: SmartAccountKit;
}

export async function connectApp(app: URL) {
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(new URL(path, app), {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data as T;
  }

  const readState = (address?: string) => api<StateView>(`/api/state?fresh=1${address ? `&address=${address}` : ""}`);

  const { contract } = await readState();
  const nodus = new NodusClient({ contractId: contract, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE });

  /** A business creates its account and names itself, as on the welcome screen. */
  async function join(name: string): Promise<Business> {
    const kit = new SmartAccountKit({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      accountWasmHash: ACCOUNT_WASM_HASH,
      webauthnVerifierAddress: WEBAUTHN_VERIFIER,
      storage: new MemoryStorage(),
      rpId: app.hostname,
      allowedOrigins: [app.origin],
      indexerUrl: false,
      relayerUrl: new URL("/api/relay", app).href,
      webAuthn: new SoftwarePasskey(app.hostname, app.origin),
    });
    const wallet = await kit.createWallet("Nodus", name, { autoSubmit: true });
    if (!wallet.submitResult?.success) throw new Error(`Could not create ${name}: ${wallet.submitResult?.error.message}`);
    await api("/api/businesses", { address: wallet.contractId, name });
    log(`${name}: ${wallet.contractId}`);
    return { name, address: wallet.contractId, kit };
  }

  async function send(business: Business, transaction: Parameters<SmartAccountKit["signAndSubmit"]>[0]) {
    const result = await business.kit.signAndSubmit(transaction, { resolveContextRuleIds: defaultRuleIds });
    if (!result.success) throw new Error(`${business.name}: ${result.error.message}`);
  }

  /** The debtor accepts a debt registered against it. */
  const accept = async (debtor: Business, id: bigint) => send(debtor, await nodus.accept({ id }));

  /** The creditor records that the account at `debtor` owes it `amount`. Returns the id of the debt. */
  async function register(debtor: string, creditor: Business, amount: bigint): Promise<bigint> {
    const registration = await nodus.register({ creditor: creditor.address, debtor, amount });
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
    const request = await api<SigningRequest>("/api/proposals", { clearings: option.clearings, address: business.address });
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64");
    const signed = await business.kit.signAuthEntry(entry, {
      contextRuleIds: defaultRuleIds(entry),
      expiration: request.expirationLedger,
    });
    await api(`/api/proposals/${request.proposalId}/signatures`, {
      address: business.address,
      signedEntry: signed.toXDR("base64"),
    });
    log(`${business.name} signed`);
  }

  return { api, readState, join, register, accept, owe, sign };
}
