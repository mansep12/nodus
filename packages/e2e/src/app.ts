/** A client for a running instance of the web app: what a business does from its browser, done from a script. */
import { createHash } from "node:crypto";
import { xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import type { DirectoryMatch, KitCredential, SessionView, SettlementOption, SigningRequest, StateView } from "@nodus/api";
import { ACCOUNT_WASM_HASH, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, ruleIdsUnder } from "@nodus/stellar";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { log, units } from "./harness.ts";
import { SoftwarePasskey, type SavedPasskey } from "./software-passkey.ts";

export interface Business {
  name: string;
  address: string;
  kit: SmartAccountKit;
  passkey: SoftwarePasskey;
  /** The session cookie of the API, once the business entered. */
  cookie: string;
  /** The rule of the account its passkey signs under, when it is not the one the account was created with. */
  ruleId?: number;
}

/** What it takes to bring a business made by a script back in a later run. Test keys only. */
export interface SavedBusiness {
  name: string;
  address: string;
  passkey: SavedPasskey;
  credential: {
    publicKey: string;
    birthWasmHash?: string;
    creationTransactionHash?: string;
    creationLedger?: number;
    birthConstructorArgsHash?: string;
  };
}

/** A second passkey of an account made by hand, held by a script: what `enter` needs to bring it back. Test keys only. */
export interface SavedKey {
  name: string;
  passkey: SavedPasskey;
}

/** What may go with a debt: the document behind it and the day it falls due. */
export interface DebtDetails {
  /** An invoice number, say. Its hash goes on chain and the text is kept by the app. */
  note?: string;
  due?: Date;
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

  /** Writes down what `resume` needs to bring `business` back. */
  async function keep(business: Business): Promise<SavedBusiness> {
    const stored = (await business.kit.credentials.getAll()).find(
      (credential) => credential.credentialId === business.passkey.credentialId,
    )!;
    return {
      name: business.name,
      address: business.address,
      passkey: business.passkey.save(),
      credential: {
        publicKey: Buffer.from(stored.publicKey).toString("base64"),
        birthWasmHash: stored.birthWasmHash,
        creationTransactionHash: stored.creationTransactionHash,
        creationLedger: stored.creationLedger,
        birthConstructorArgsHash: stored.birthConstructorArgsHash,
      },
    };
  }

  /** A business that `keep` wrote down, connected again and with its session open. */
  async function resume(saved: SavedBusiness): Promise<Business> {
    const passkey = new SoftwarePasskey(app.hostname, app.origin, saved.passkey);
    const storage = new MemoryStorage();
    await storage.save({
      credentialId: passkey.credentialId,
      publicKey: new Uint8Array(Buffer.from(saved.credential.publicKey, "base64")),
      contractId: saved.address,
      nickname: saved.name,
      createdAt: Date.now(),
      isPrimary: true,
      contextRuleId: 0,
      deploymentStatus: "deployed",
      birthWasmHash: saved.credential.birthWasmHash,
      creationTransactionHash: saved.credential.creationTransactionHash,
      creationLedger: saved.credential.creationLedger,
      birthConstructorArgsHash: saved.credential.birthConstructorArgsHash,
    });
    const kit = newKit(passkey, storage);
    await kit.connectWallet({ credentialId: passkey.credentialId, contractId: saved.address });
    const business: Business = { name: saved.name, address: saved.address, kit, passkey, cookie: "" };
    await login(business);
    return business;
  }

  /**
   * Enters an account with a passkey that was added to it later (a backup device of the owner), as a browser that never saw the account
   * does: the API hands out the account's passkeys and the kit connects with the one that signed.
   */
  async function enter(saved: SavedKey): Promise<Business> {
    const passkey = new SoftwarePasskey(app.hostname, app.origin, saved.passkey);
    const storage = new MemoryStorage();
    const business: Business = { name: saved.name, address: "", kit: newKit(passkey, storage), passkey, cookie: "" };
    const session = await login(business);
    const primary = session.credentials.find((record) => record.isPrimary)!;
    for (const record of session.credentials) {
      await storage.save({
        credentialId: record.credentialId,
        publicKey: new Uint8Array(Buffer.from(record.publicKey, "hex")),
        contractId: record.contractId,
        createdAt: Date.now(),
        isPrimary: record.isPrimary,
        contextRuleId: record.contextRuleId,
        associationVerified: !record.isPrimary,
        deploymentStatus: "deployed",
        birthWasmHash: record.birthWasmHash ?? primary.birthWasmHash,
        creationTransactionHash: record.creationTransactionHash ?? primary.creationTransactionHash,
        creationLedger: record.creationLedger ?? primary.creationLedger,
        birthConstructorArgsHash: record.birthConstructorArgsHash ?? primary.birthConstructorArgsHash,
      });
    }
    await business.kit.connectWallet({ credentialId: session.credentialId, contractId: session.address });
    business.address = session.address;
    business.ruleId = session.credentials.find((record) => record.credentialId === session.credentialId)!.contextRuleId;
    return business;
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
    const result = await business.kit.signAndSubmit(transaction, {
      resolveContextRuleIds: (entry) => ruleIdsUnder(entry, business.ruleId ?? 0),
    });
    if (!result.success) throw new Error(`${business.name}: ${result.error.message}`);
  }

  /** The debtor accepts a debt registered against it. */
  const accept = async (debtor: Business, id: bigint) => send(debtor, await (await nodus(debtor)).accept({ id }));

  /** The debtor pays part of an accepted debt directly. */
  const pay = async (debtor: Business, id: bigint, amount: bigint) => send(debtor, await (await nodus(debtor)).pay({ id, amount }));

  /** The creditor records that the account at `debtor` owes it `amount`. Returns the id of the debt. */
  async function register(debtor: string, creditor: Business, amount: bigint, { note, due }: DebtDetails = {}): Promise<bigint> {
    const registration = await (
      await nodus(creditor)
    ).register({
      creditor: creditor.address,
      debtor,
      amount,
      reference: note ? createHash("sha256").update(note).digest() : undefined,
      due: due ? BigInt(Math.floor(due.getTime() / 1000)) : undefined,
    });
    const id = registration.result.unwrap();
    await send(creditor, registration);
    if (note) await api("/api/notes", { obligationId: id.toString(), text: note }, creditor);
    return id;
  }

  /** The creditor registers the debt and the debtor accepts it. Returns its id. */
  async function owe(debtor: Business, creditor: Business, amount: bigint, details?: DebtDetails): Promise<string> {
    const id = await register(debtor.address, creditor, amount, details);
    await accept(debtor, id);
    log(`${debtor.name} owes ${creditor.name} ${units(amount)} (obligation ${id})`);
    return id.toString();
  }

  /** The business signs its part of a settlement, as the "Firmar" button does. */
  async function sign(option: SettlementOption, business: Business) {
    const request = await api<SigningRequest>("/api/proposals", { clearings: option.clearings }, business);
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64");
    const signed = await business.kit.signAuthEntry(entry, {
      contextRuleIds: ruleIdsUnder(entry, business.ruleId ?? 0),
      expiration: request.expirationLedger,
    });
    await api(`/api/proposals/${request.proposalId}/signatures`, { signedEntry: signed.toXDR("base64") }, business);
    log(`${business.name} signed`);
  }

  /**
   * The address of the business called `name`, as `asking` finds it in the directory. Waits for the business to exist, which lets a script
   * start before the account it needs is made by hand in the app. The directory limits searches per hour, so it asks only every 10 s.
   */
  async function find(asking: Business, name: string, patience = 10 * 60_000): Promise<string> {
    const wanted = name.trim().toLowerCase();
    const until = Date.now() + patience;
    for (;;) {
      try {
        const matches = await api<DirectoryMatch[]>(`/api/businesses?q=${encodeURIComponent(name.trim())}`, undefined, asking);
        const found = matches.filter((match) => match.name.trim().toLowerCase() === wanted);
        if (found.length > 1) throw new Error(`There is more than one business called "${name}": give its address instead.`);
        if (found[0]) return found[0].address;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("There is more than one")) throw error;
        log(`Could not ask the directory (${error instanceof Error ? error.message : error}); trying again.`);
      }
      if (Date.now() > until) throw new Error(`No business called "${name}" showed up in ${patience / 60_000} minutes.`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  return { api, readState, join, keep, resume, enter, login, register, accept, pay, owe, sign, find, newKit };
}
