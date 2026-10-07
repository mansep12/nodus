import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { rawPublicKey, verifyAssertion, type AssertionExpectations, type AssertionJSON } from "./index.ts";

const RP_ID = "nodus.example";
const ORIGIN = "https://nodus.example";
const CHALLENGE = "a-nonce-handed-out-by-the-server";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest();
const b64url = (data: Buffer) => data.toString("base64url");

function passkey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  // The last 65 bytes of the DER encoding are the uncompressed point.
  return { privateKey, spki, raw: new Uint8Array(spki.subarray(-65)) };
}

interface Tampering {
  type?: string;
  challenge?: string;
  origin?: string;
  rpId?: string;
  flags?: number;
}

/** What a browser authenticator answers when asked to sign `CHALLENGE`, as the software passkey of the e2e scripts does. */
function assertion(privateKey: KeyObject, tampering: Tampering = {}): AssertionJSON {
  const clientData = Buffer.from(
    JSON.stringify({
      type: tampering.type ?? "webauthn.get",
      challenge: tampering.challenge ?? CHALLENGE,
      origin: tampering.origin ?? ORIGIN,
      crossOrigin: false,
    }),
  );
  const userPresentAndVerified = 0x05;
  const authenticatorData = Buffer.concat([
    sha256(Buffer.from(tampering.rpId ?? RP_ID)),
    Buffer.from([tampering.flags ?? userPresentAndVerified]),
    Buffer.alloc(4),
  ]);
  const signature = sign("sha256", Buffer.concat([authenticatorData, sha256(clientData)]), privateKey);
  return {
    id: "credential",
    response: { clientDataJSON: b64url(clientData), authenticatorData: b64url(authenticatorData), signature: b64url(signature) },
  };
}

describe("verifyAssertion", () => {
  const key = passkey();
  const expected: AssertionExpectations = {
    challenge: CHALLENGE,
    rpId: RP_ID,
    origins: ["http://localhost:3000", ORIGIN],
    publicKey: key.raw,
  };

  test("accepts a fresh, user-verified signature of the passkey", () => {
    expect(verifyAssertion(assertion(key.privateKey), expected)).toEqual({ ok: true });
  });

  test("refuses an answer to another challenge", () => {
    expect(verifyAssertion(assertion(key.privateKey, { challenge: "an-older-nonce" }), expected)).toEqual({
      ok: false,
      reason: "challenge does not match",
    });
  });

  test("refuses an assertion made on another site", () => {
    expect(verifyAssertion(assertion(key.privateKey, { origin: "https://evil.example" }), expected)).toEqual({
      ok: false,
      reason: "origin not allowed",
    });
  });

  test("refuses a passkey created for another relying party", () => {
    expect(verifyAssertion(assertion(key.privateKey, { rpId: "evil.example" }), expected)).toEqual({
      ok: false,
      reason: "relying party does not match",
    });
  });

  test("refuses an assertion where the person was present but not verified", () => {
    expect(verifyAssertion(assertion(key.privateKey, { flags: 0x01 }), expected)).toEqual({
      ok: false,
      reason: "the person was not verified",
    });
  });

  test("refuses a signature made with another key", () => {
    expect(verifyAssertion(assertion(passkey().privateKey), expected)).toEqual({ ok: false, reason: "signature does not verify" });
  });

  test("refuses a registration passed off as an authentication", () => {
    expect(verifyAssertion(assertion(key.privateKey, { type: "webauthn.create" }), expected)).toEqual({
      ok: false,
      reason: "not an authentication",
    });
  });

  test("says why when the fields are not base64url-encoded data", () => {
    const valid = assertion(key.privateKey);
    const malformed = { ...valid, response: { ...valid.response, clientDataJSON: "%%% not base64 %%%" } };

    expect(verifyAssertion(malformed, expected)).toEqual({ ok: false, reason: expect.stringMatching(/./) });
  });

  test("refuses to check against a key that is not an uncompressed P-256 point", () => {
    const reason = "public key is not an uncompressed P-256 point";
    // The compressed form of the same point.
    const compressed = new Uint8Array([2 + (key.raw[64]! & 1), ...key.raw.subarray(1, 33)]);
    const notUncompressed = new Uint8Array([0x02, ...key.raw.subarray(1)]);

    expect(verifyAssertion(assertion(key.privateKey), { ...expected, publicKey: compressed })).toEqual({ ok: false, reason });
    expect(verifyAssertion(assertion(key.privateKey), { ...expected, publicKey: notUncompressed })).toEqual({ ok: false, reason });
    expect(verifyAssertion(assertion(key.privateKey), { ...expected, publicKey: key.spki })).toEqual({ ok: false, reason });
  });
});

describe("rawPublicKey", () => {
  const key = passkey();

  test("returns a raw uncompressed key as it is", () => {
    expect(rawPublicKey(key.raw)).toEqual(key.raw);
  });

  test("takes the point out of an SPKI-encoded key", () => {
    expect(key.spki).toHaveLength(91);
    expect([...rawPublicKey(key.spki)]).toEqual([...key.raw]);
  });

  test("refuses anything else", () => {
    expect(() => rawPublicKey(key.raw.subarray(0, 33))).toThrow("Not a P-256 public key");
    expect(() => rawPublicKey(new Uint8Array([0x02, ...key.raw.subarray(1)]))).toThrow("Not a P-256 public key");
    expect(() => rawPublicKey(Buffer.concat([key.spki, Buffer.from([0])]))).toThrow("Not a P-256 public key");
    expect(() => rawPublicKey(new Uint8Array(91))).toThrow("Not a P-256 public key");
  });
});
