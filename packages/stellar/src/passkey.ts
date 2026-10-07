import { Address, buildAuthorizationEntryPreimage, hash, xdr } from "@stellar/stellar-sdk";
import { addressCredentials, defaultRuleIds } from "./auth.ts";

/** The passkey a smart account answers to. */
export interface PasskeySigner {
  /** The contract that verifies WebAuthn signatures for the account. */
  verifier: string;
  /** The passkey's public key (65 bytes, uncompressed P-256) followed by its credential id. */
  keyData: Uint8Array;
}

const PUBLIC_KEY_LENGTH = 65;
const USER_PRESENT_AND_VERIFIED = 0x05;
/** Half the order of the P-256 curve: the network only accepts signatures whose `s` is below it. */
const HALF_CURVE_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n / 2n;

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

function field(map: xdr.ScVal, name: string): xdr.ScVal | undefined {
  if (map.switch().name !== "scvMap") return undefined;
  return map
    .map()
    ?.find((entry) => entry.key().switch().name === "scvSymbol" && entry.key().sym().toString() === name)
    ?.val();
}

const bytes = (value: xdr.ScVal | undefined) => (value?.switch().name === "scvBytes" ? value.bytes() : undefined);

/**
 * The context rule a signed entry claims to be signed under, when every
 * invocation in it claims the same one; undefined otherwise.
 */
export function signedRuleId(entry: xdr.SorobanAuthorizationEntry): number | undefined {
  try {
    const ruleIds = field(addressCredentials(entry).signature(), "context_rule_ids");
    if (ruleIds?.switch().name !== "scvVec") return undefined;
    const ids = (ruleIds.vec() ?? []).map((id) => (id.switch().name === "scvU32" ? id.u32() : -1));
    if (ids.length !== defaultRuleIds(entry).length || ids.some((id) => id < 0 || id !== ids[0])) return undefined;
    return ids[0];
  } catch {
    return undefined;
  }
}

/**
 * Whether `entry` carries a signature of `signer` that its smart account will
 * accept: a WebAuthn assertion, under the account's rule `ruleId`, over the
 * digest of exactly this entry. It repeats off chain what the account and its
 * WebAuthn verifier check on chain, to tell a forged signature apart before
 * sending anything.
 */
export async function isSignedByPasskey(
  entry: xdr.SorobanAuthorizationEntry,
  signer: PasskeySigner,
  networkPassphrase: string,
  ruleId = 0,
): Promise<boolean> {
  try {
    const credentials = addressCredentials(entry);
    const payload = credentials.signature();
    const ruleIds = field(payload, "context_rule_ids");
    const signers = field(payload, "signers");
    if (ruleIds?.switch().name !== "scvVec" || signers?.switch().name !== "scvMap") return false;

    // Every invocation in the entry must be signed under the same rule.
    if (signedRuleId(entry) !== ruleId) return false;

    const signerKey = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("External"),
      Address.fromString(signer.verifier).toScVal(),
      xdr.ScVal.scvBytes(Buffer.from(signer.keyData)),
    ]).toXDR("base64");
    const signed = bytes((signers.map() ?? []).find((each) => each.key().toXDR("base64") === signerKey)?.val());
    if (!signed) return false;

    const assertion = xdr.ScVal.fromXDR(signed);
    const authenticatorData = bytes(field(assertion, "authenticator_data"));
    const clientData = bytes(field(assertion, "client_data"));
    const signature = bytes(field(assertion, "signature"));
    if (!authenticatorData || !clientData || signature?.length !== 64) return false;
    if (BigInt(`0x${signature.subarray(32).toString("hex")}`) > HALF_CURVE_ORDER) return false;

    // What gets signed binds the entry (its invocations, nonce and expiration) and the rules it is signed under.
    const preimage = buildAuthorizationEntryPreimage(
      xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR()),
      credentials.signatureExpirationLedger(),
      networkPassphrase,
    );
    const digest = hash(Buffer.concat([hash(preimage.toXDR()), ruleIds.toXDR()]));

    const { type, challenge } = JSON.parse(clientData.toString("utf8")) as { type?: unknown; challenge?: unknown };
    if (type !== "webauthn.get" || challenge !== base64url(digest)) return false;
    const flags = authenticatorData[32];
    if (authenticatorData.length < 37 || flags === undefined || (flags & USER_PRESENT_AND_VERIFIED) !== USER_PRESENT_AND_VERIFIED) {
      return false;
    }

    const publicKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(signer.keyData.subarray(0, PUBLIC_KEY_LENGTH)),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      new Uint8Array(signature),
      new Uint8Array(Buffer.concat([authenticatorData, hash(clientData)])),
    );
  } catch {
    return false;
  }
}
