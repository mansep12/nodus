import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { Address, Keypair, StrKey, buildAuthorizationEntryPreimage, hash, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, WEBAUTHN_VERIFIER, addressCredentials, isSignedByPasskey, type PasskeySigner } from "./index.ts";

const ACCOUNT = StrKey.encodeContract(Buffer.alloc(32, 7));
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
const CURVE_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

function passkey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  // The last 65 bytes of the DER encoding are the uncompressed point.
  const point = publicKey.export({ type: "spki", format: "der" }).subarray(-65);
  const signer: PasskeySigner = { verifier: WEBAUTHN_VERIFIER, keyData: Buffer.concat([point, Buffer.from("credential id")]) };
  return { privateKey, signer };
}

/** An entry asking ACCOUNT to authorize a call that makes one further call. */
function unsignedEntry(amount = 10n): xdr.SorobanAuthorizationEntry {
  const call = (fn: string, subInvocations: xdr.SorobanAuthorizedInvocation[] = []) =>
    new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(CONTRACT).toScAddress(),
          functionName: fn,
          args: [nativeToScVal(amount, { type: "i128" })],
        }),
      ),
      subInvocations,
    });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(ACCOUNT).toScAddress(),
        nonce: xdr.Int64.fromString("123456789"),
        signatureExpirationLedger: 5_000_000,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: call("settle", [call("transfer")]),
  });
}

interface Tampering {
  ruleIds?: number[];
  clientDataType?: string;
  flags?: number;
  highS?: boolean;
}

/** Signs `entry` the way a smart account's passkey does. */
function signEntry(entry: xdr.SorobanAuthorizationEntry, privateKey: KeyObject, signer: PasskeySigner, tampering: Tampering = {}) {
  const signed = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
  const credentials = addressCredentials(signed);
  const ruleIds = xdr.ScVal.scvVec((tampering.ruleIds ?? [0, 0]).map((id) => xdr.ScVal.scvU32(id)));
  const preimage = buildAuthorizationEntryPreimage(
    xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR()),
    credentials.signatureExpirationLedger(),
    NETWORK_PASSPHRASE,
  );
  const digest = hash(Buffer.concat([hash(preimage.toXDR()), ruleIds.toXDR()]));

  const clientData = Buffer.from(
    JSON.stringify({
      type: tampering.clientDataType ?? "webauthn.get",
      challenge: digest.toString("base64url"),
      origin: "https://nodus.example",
      crossOrigin: false,
    }),
  );
  const authenticatorData = Buffer.concat([
    createHash("sha256").update("nodus.example").digest(),
    Buffer.from([tampering.flags ?? 0x05, 0, 0, 0, 0]),
  ]);
  const message = Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]);
  const raw = sign("sha256", message, { key: privateKey, dsaEncoding: "ieee-p1363" });
  // Signatures are sent with the lower of the two valid values of `s`.
  let s = BigInt(`0x${raw.subarray(32).toString("hex")}`);
  if (s > CURVE_ORDER / 2n !== Boolean(tampering.highS)) s = CURVE_ORDER - s;
  const signature = Buffer.concat([raw.subarray(0, 32), Buffer.from(s.toString(16).padStart(64, "0"), "hex")]);

  const entryOf = (key: string, value: Buffer) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: xdr.ScVal.scvBytes(value) });
  const assertion = xdr.ScVal.scvMap([
    entryOf("authenticator_data", authenticatorData),
    entryOf("client_data", clientData),
    entryOf("signature", signature),
  ]);
  const signerKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    Address.fromString(signer.verifier).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(signer.keyData)),
  ]);
  credentials.signature(
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: ruleIds }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signers"),
        val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signerKey, val: xdr.ScVal.scvBytes(assertion.toXDR()) })]),
      }),
    ]),
  );
  return signed;
}

describe("isSignedByPasskey", () => {
  const { privateKey, signer } = passkey();
  const check = (entry: xdr.SorobanAuthorizationEntry, by = signer) => isSignedByPasskey(entry, by, NETWORK_PASSPHRASE);

  test("accepts the passkey's signature of the entry", async () => {
    expect(await check(signEntry(unsignedEntry(), privateKey, signer))).toBe(true);
  });

  test("rejects an entry that is not signed", async () => {
    expect(await check(unsignedEntry())).toBe(false);
  });

  test("rejects a signature made with another key", async () => {
    const stranger = passkey();
    // Claims to be the account's passkey, but is signed by someone else's.
    expect(await check(signEntry(unsignedEntry(), stranger.privateKey, signer))).toBe(false);
    // Properly signed, but by a passkey the account does not answer to.
    expect(await check(signEntry(unsignedEntry(), stranger.privateKey, stranger.signer))).toBe(false);
  });

  test("rejects a signature moved to an entry that authorizes something else", async () => {
    const signed = signEntry(unsignedEntry(10n), privateKey, signer);
    const other = unsignedEntry(11n);
    addressCredentials(other).signature(addressCredentials(signed).signature());

    expect(await check(other)).toBe(false);
  });

  test("rejects a signature whose expiration was changed afterwards", async () => {
    const signed = signEntry(unsignedEntry(), privateKey, signer);
    addressCredentials(signed).signatureExpirationLedger(6_000_000);

    expect(await check(signed)).toBe(false);
  });

  test("rejects signatures the account's verifier would not take", async () => {
    const entry = unsignedEntry();
    // Not under the default rule, or not one rule per invocation.
    expect(await check(signEntry(entry, privateKey, signer, { ruleIds: [0, 1] }))).toBe(false);
    expect(await check(signEntry(entry, privateKey, signer, { ruleIds: [0] }))).toBe(false);
    // Made for registering a passkey rather than for signing with it.
    expect(await check(signEntry(entry, privateKey, signer, { clientDataType: "webauthn.create" }))).toBe(false);
    // Without the user having been verified.
    expect(await check(signEntry(entry, privateKey, signer, { flags: 0x01 }))).toBe(false);
    // With the higher of the two values of `s`.
    expect(await check(signEntry(entry, privateKey, signer, { highS: true }))).toBe(false);
  });

  test("rejects anything that is not an entry signed by a smart account", async () => {
    const classic = Keypair.random();
    const entry = unsignedEntry();
    addressCredentials(entry).signature(nativeToScVal([{ public_key: classic.rawPublicKey(), signature: classic.sign(Buffer.alloc(32)) }]));

    expect(await check(entry)).toBe(false);
  });
});
