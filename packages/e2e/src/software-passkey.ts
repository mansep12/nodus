import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

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
  readonly credentialId = b64url(randomBytes(32));
  private readonly privateKey: KeyObject;
  private readonly publicKeySpki: Buffer;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = pair.privateKey;
    this.publicKeySpki = pair.publicKey.export({ type: "spki", format: "der" });
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
