import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

export interface SavedPasskey {
  credentialId: string;
  /** PKCS#8 DER, base64. */
  privateKey: string;
  /** SPKI DER, base64. */
  publicKey: string;
}

type RegistrationArgs = { optionsJSON: { challenge: string } };
type AuthenticationArgs = { optionsJSON: { challenge: string } };

const b64url = (data: Buffer) => data.toString("base64url");
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest();

/**
 * A passkey held in memory, for driving smart accounts from a script.
 *
 * It produces the same WebAuthn responses a browser authenticator would
 * (authenticator data, client data JSON, DER signature over P-256), so the
 * on-chain verification and its cost are identical to a real passkey.
 */
export class SoftwarePasskey {
  readonly credentialId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKeySpki: Buffer;

  /** A new passkey, or the one that `save` wrote down. */
  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    saved?: SavedPasskey,
  ) {
    if (saved) {
      this.credentialId = saved.credentialId;
      this.privateKey = createPrivateKey({ key: Buffer.from(saved.privateKey, "base64"), format: "der", type: "pkcs8" });
      this.publicKeySpki = Buffer.from(saved.publicKey, "base64");
      return;
    }
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.credentialId = b64url(randomBytes(32));
    this.privateKey = pair.privateKey;
    this.publicKeySpki = pair.publicKey.export({ type: "spki", format: "der" });
  }

  /** What it takes to bring this passkey back in another run. Test keys only: never for a real account. */
  save(): SavedPasskey {
    return {
      credentialId: this.credentialId,
      privateKey: this.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      publicKey: this.publicKeySpki.toString("base64"),
    };
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  private authenticatorData(): Buffer {
    const userPresentAndVerified = 0x05;
    const signCount = Buffer.alloc(4);
    return Buffer.concat([sha256(Buffer.from(this.rpId)), Buffer.from([userPresentAndVerified]), signCount]);
  }

  startRegistration = async ({ optionsJSON }: RegistrationArgs) => ({
    id: this.credentialId,
    rawId: this.credentialId,
    type: "public-key" as const,
    authenticatorAttachment: "platform" as const,
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64url(this.clientData("webauthn.create", optionsJSON.challenge)),
      // The kit reads the key from `publicKey`; the attestation is not inspected.
      attestationObject: "",
      authenticatorData: b64url(this.authenticatorData()),
      publicKey: b64url(this.publicKeySpki),
      publicKeyAlgorithm: -7,
      transports: ["internal" as const],
    },
  });

  startAuthentication = async ({ optionsJSON }: AuthenticationArgs) => {
    const authenticatorData = this.authenticatorData();
    const clientDataJSON = this.clientData("webauthn.get", optionsJSON.challenge);
    const signature = sign("sha256", Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.privateKey);
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: "public-key" as const,
      authenticatorAttachment: "platform" as const,
      clientExtensionResults: {},
      response: {
        authenticatorData: b64url(authenticatorData),
        clientDataJSON: b64url(clientDataJSON),
        signature: b64url(signature),
      },
    };
  };
}
