/**
 * Stands in for the device's passkeys with keys kept in the browser's storage,
 * so that the app can be driven by automated tests. It answers with the same
 * WebAuthn responses a real authenticator gives, so everything downstream,
 * including the on-chain verification, is the real thing.
 *
 * Not for real use: these keys are not protected by the device.
 */

const STORAGE_KEY = "nodus.software-passkeys";

interface StoredPasskey {
  name: string;
  privateKey: JsonWebKey;
}

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

const sha256 = async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest("SHA-256", data));

function load(): Record<string, StoredPasskey> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
}

/** The passkeys kept in this browser, to choose which business to enter as. */
export function softwarePasskeys(): Array<{ credentialId: string; name: string }> {
  return Object.entries(load()).map(([credentialId, { name }]) => ({ credentialId, name }));
}

let chosen: string | undefined;

/** Picks the passkey that answers when the app asks for "any" passkey, as a person would in the browser's dialog. */
export function chooseSoftwarePasskey(credentialId: string) {
  chosen = credentialId;
}

function clientData(type: "webauthn.create" | "webauthn.get", challenge: string) {
  return encoder.encode(JSON.stringify({ type, challenge, origin: location.origin, crossOrigin: false }));
}

async function authenticatorData() {
  const userPresentAndVerified = 0x05;
  return concat(await sha256(encoder.encode(location.hostname)), new Uint8Array([userPresentAndVerified, 0, 0, 0, 0]));
}

/** WebCrypto signs as r || s; WebAuthn carries the same signature DER-encoded. */
function derSignature(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.subarray(start);
    const padded = trimmed[0]! & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
    return concat(new Uint8Array([0x02, padded.length]), padded);
  };
  const body = concat(integer(raw.subarray(0, 32)), integer(raw.subarray(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export const softwareAuthenticator = {
  async startRegistration({ optionsJSON }: { optionsJSON: { challenge: string; user: { name: string } } }) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const credentialId = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const passkeys = load();
    passkeys[credentialId] = {
      // The kit appends the date to the name it is given.
      name: optionsJSON.user.name.split(" — ")[0]!,
      privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passkeys));
    chosen = credentialId;

    return {
      id: credentialId,
      rawId: credentialId,
      type: "public-key" as const,
      authenticatorAttachment: "platform" as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(clientData("webauthn.create", optionsJSON.challenge)),
        // The kit reads the key from `publicKey`; the attestation is not inspected.
        attestationObject: "",
        authenticatorData: base64url(await authenticatorData()),
        publicKey: base64url(await crypto.subtle.exportKey("spki", pair.publicKey)),
        publicKeyAlgorithm: -7,
        transports: ["internal" as const],
      },
    };
  },

  async startAuthentication({ optionsJSON }: { optionsJSON: { challenge: string; allowCredentials?: Array<{ id: string }> } }) {
    const credentialId = optionsJSON.allowCredentials?.[0]?.id ?? chosen;
    const passkey = credentialId ? load()[credentialId] : undefined;
    if (!credentialId || !passkey) throw new DOMException("No passkey to sign with", "NotAllowedError");

    const key = await crypto.subtle.importKey("jwk", passkey.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const authData = await authenticatorData();
    const clientDataJSON = clientData("webauthn.get", optionsJSON.challenge);
    const signed = concat(authData, await sha256(clientDataJSON));
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signed);

    return {
      id: credentialId,
      rawId: credentialId,
      type: "public-key" as const,
      authenticatorAttachment: "platform" as const,
      clientExtensionResults: {},
      response: {
        authenticatorData: base64url(authData),
        clientDataJSON: base64url(clientDataJSON),
        signature: base64url(derSignature(new Uint8Array(signature))),
      },
    };
  },
};
