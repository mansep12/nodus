/**
 * Verifies a WebAuthn assertion off chain: what a passkey produces when its
 * owner authenticates. The app uses it to open a session for a smart account
 * from the passkey that controls it, the same way the account's verifier
 * checks signatures on chain.
 */
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

/** The assertion as the browser hands it over, every field base64url. */
export interface AssertionJSON {
  id: string;
  rawId?: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
  };
}

export interface AssertionExpectations {
  /** The nonce the server handed out for this assertion. */
  challenge: string;
  /** The relying party id the passkey was created for: the app's hostname. */
  rpId: string;
  /** The origins the assertion may come from. */
  origins: string[];
  /** Uncompressed P-256 public key, 65 bytes. */
  publicKey: Uint8Array;
}

const USER_PRESENT = 0x01;
const USER_VERIFIED = 0x04;
const PUBLIC_KEY_LENGTH = 65;
const AUTHENTICATOR_DATA_MIN = 37;

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest();

/** The SPKI encoding of an uncompressed P-256 point, for the platform's crypto. */
function spki(publicKey: Uint8Array): Buffer {
  const prefix = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");
  return Buffer.concat([prefix, Buffer.from(publicKey)]);
}

/**
 * Whether `assertion` is a fresh, user-verified signature by `publicKey` over
 * `challenge`, made for `rpId` from one of `origins`. Says why when it is not.
 */
export function verifyAssertion(assertion: AssertionJSON, expected: AssertionExpectations): { ok: true } | { ok: false; reason: string } {
  try {
    if (expected.publicKey.length !== PUBLIC_KEY_LENGTH || expected.publicKey[0] !== 0x04) {
      return { ok: false, reason: "public key is not an uncompressed P-256 point" };
    }
    const clientData = Buffer.from(assertion.response.clientDataJSON, "base64url");
    const authenticatorData = Buffer.from(assertion.response.authenticatorData, "base64url");
    const signature = Buffer.from(assertion.response.signature, "base64url");

    const client = JSON.parse(clientData.toString("utf8")) as { type?: unknown; challenge?: unknown; origin?: unknown };
    if (client.type !== "webauthn.get") return { ok: false, reason: "not an authentication" };
    if (client.challenge !== expected.challenge) return { ok: false, reason: "challenge does not match" };
    if (typeof client.origin !== "string" || !expected.origins.includes(client.origin)) return { ok: false, reason: "origin not allowed" };

    if (authenticatorData.length < AUTHENTICATOR_DATA_MIN) return { ok: false, reason: "authenticator data too short" };
    if (!authenticatorData.subarray(0, 32).equals(sha256(Buffer.from(expected.rpId))))
      return { ok: false, reason: "relying party does not match" };
    const flags = authenticatorData[32]!;
    if ((flags & USER_PRESENT) === 0 || (flags & USER_VERIFIED) === 0) return { ok: false, reason: "the person was not verified" };

    const key = createPublicKey({ key: spki(expected.publicKey), format: "der", type: "spki" });
    const signed = Buffer.concat([authenticatorData, sha256(clientData)]);
    if (!verifySignature("sha256", signed, { key, dsaEncoding: "der" }, signature))
      return { ok: false, reason: "signature does not verify" };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** The 65-byte public key inside an SPKI-encoded P-256 key, or the key itself when already raw. */
export function rawPublicKey(key: Uint8Array): Uint8Array {
  if (key.length === PUBLIC_KEY_LENGTH && key[0] === 0x04) return key;
  if (key.length === 91 && key[key.length - PUBLIC_KEY_LENGTH] === 0x04) return key.subarray(key.length - PUBLIC_KEY_LENGTH);
  throw new Error("Not a P-256 public key");
}
