import { IndexedDBStorage, SmartAccountKit, type StoredCredential } from "smart-account-kit";
import type { KitCredential } from "@nodus/api";
import { ACCOUNT_WASM_HASH, HORIZON_URL, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER } from "@nodus/stellar";
import { SOFTWARE_PASSKEYS } from "./config";
import { softwareAuthenticator } from "./software-passkey";

let kit: SmartAccountKit | undefined;
let storage: IndexedDBStorage | undefined;

/** Where the kit keeps what it knows about this browser's passkeys. */
export function getStorage(): IndexedDBStorage {
  return (storage ??= new IndexedDBStorage());
}

/** The smart account SDK. It needs the browser, so it is created on first use. */
export function getKit(): SmartAccountKit {
  return (kit ??= new SmartAccountKit({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    // Horizon keeps the whole history: it is how an account older than the RPC's memory proves its creation.
    horizonUrl: HORIZON_URL,
    accountWasmHash: ACCOUNT_WASM_HASH,
    webauthnVerifierAddress: WEBAUTHN_VERIFIER,
    storage: getStorage(),
    rpName: "Nodus",
    rpId: window.location.hostname,
    allowedOrigins: [window.location.origin],
    // Every transaction goes through our relayer route, which pays its fee.
    relayerUrl: `${window.location.origin}/api/relay`,
    // What the kit would ask an indexer, our own API answers: see `seedCredentials`.
    indexerUrl: false,
    webAuthn: SOFTWARE_PASSKEYS ? softwareAuthenticator : undefined,
  }));
}

/**
 * Gives the kit the records of an account's passkeys, so that it can connect
 * in a browser that did not create the account. The records come from our
 * API, which only hands out what it has checked against the chain.
 */
export async function seedCredentials(records: KitCredential[]): Promise<void> {
  const store = getStorage();
  for (const record of records) {
    const existing = await store.get(record.credentialId);
    const credential: StoredCredential = {
      credentialId: record.credentialId,
      publicKey: new Uint8Array(Buffer.from(record.publicKey, "hex")),
      contractId: record.contractId,
      nickname: record.label || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
      isPrimary: record.isPrimary,
      contextRuleId: record.contextRuleId,
      associationVerified: !record.isPrimary,
      deploymentStatus: "deployed",
      birthWasmHash: record.birthWasmHash,
      creationTransactionHash: record.creationTransactionHash,
      creationLedger: record.creationLedger,
      birthConstructorArgsHash: record.birthConstructorArgsHash,
    };
    await store.save({ ...existing, ...credential });
  }
}

/** What our API needs to know about a passkey this browser holds for `contractId`. */
export async function describeCredential(credentialId: string): Promise<KitCredential | undefined> {
  const stored = await getStorage().get(credentialId);
  if (!stored) return undefined;
  return {
    credentialId: stored.credentialId,
    publicKey: Buffer.from(stored.publicKey).toString("hex"),
    contractId: stored.contractId,
    contextRuleId: stored.contextRuleId ?? 0,
    isPrimary: stored.isPrimary !== false,
    // The kit names passkeys after the account and the date; the app labels them by device or person.
    label: "",
    birthWasmHash: stored.birthWasmHash,
    creationTransactionHash: stored.creationTransactionHash,
    creationLedger: stored.creationLedger,
    birthConstructorArgsHash: stored.birthConstructorArgsHash,
  };
}
