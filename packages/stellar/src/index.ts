/** What the app and the testnet scripts share about the network Nodus runs on. */
import { Networks } from "@stellar/stellar-sdk";

export { addressCredentials, defaultRuleIds, entryAddress } from "./auth.ts";
export { isSignedByPasskey, type PasskeySigner } from "./passkey.ts";

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const EXPLORER_URL = "https://stellar.expert/explorer/testnet";

// OpenZeppelin smart account contracts deployed on testnet (smart-account-kit 0.8).
export const ACCOUNT_WASM_HASH = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
export const WEBAUTHN_VERIFIER = "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";

const CHANNELS_URL = "https://channels.openzeppelin.com/testnet";

export class RelayError extends Error {}

/**
 * Submits a contract invocation through OpenZeppelin Channels. The service
 * wraps it in a transaction from one of its own accounts and pays the fee, so
 * no participant needs XLM. Resolves with the hash once the transaction is
 * confirmed; `func` and `auth` are base64 XDR.
 */
export async function relay(apiKey: string, func: string, auth: string[]): Promise<string> {
  const response = await fetch(`${CHANNELS_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ params: { func, auth } }),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    data?: { hash?: string | null };
  } | null;
  if (!body?.success || !body.data?.hash) {
    throw new RelayError(body?.error ?? `The relayer answered HTTP ${response.status}`);
  }
  return body.data.hash;
}
