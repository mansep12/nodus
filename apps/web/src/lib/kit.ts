import { IndexedDBStorage, SmartAccountKit } from "smart-account-kit";
import { ACCOUNT_WASM_HASH, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER } from "@nodus/stellar";
import { SOFTWARE_PASSKEYS } from "./config";
import { softwareAuthenticator } from "./software-passkey";

let kit: SmartAccountKit | undefined;

/** The smart account SDK. It needs the browser, so it is created on first use. */
export function getKit(): SmartAccountKit {
  return (kit ??= new SmartAccountKit({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    accountWasmHash: ACCOUNT_WASM_HASH,
    webauthnVerifierAddress: WEBAUTHN_VERIFIER,
    storage: new IndexedDBStorage(),
    rpName: "Nodus",
    // Every transaction goes through our relayer route, which pays its fee.
    relayerUrl: `${window.location.origin}/api/relay`,
    // Accounts are found from their passkey alone, so no account indexer is needed.
    indexerUrl: false,
    webAuthn: SOFTWARE_PASSKEYS ? softwareAuthenticator : undefined,
  }));
}
