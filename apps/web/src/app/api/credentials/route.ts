import { credentialsOf, kitRecord, registerCredential, type Birth } from "@/server/credentials";
import { respond } from "@/server/errors";
import { account, body, hash32, integer, optionalText, text } from "@/server/input";
import { LIMITS, clientIp } from "@/server/limits";
import { requireSession } from "@/server/session";

/**
 * Records a passkey of an account. Needs no session: the account's own rule
 * on chain says whether the passkey answers for it, and the creation facts
 * are checked against the creation transaction.
 */
export async function POST(request: Request) {
  return respond(async () => {
    await LIMITS.sessionPerIp(clientIp(request));
    const input = await body(request);
    const birth = input.birth as Record<string, unknown> | undefined;
    const record = await registerCredential({
      address: account(input.address),
      credentialId: text(input.credentialId, "la passkey", 2_000),
      publicKey: text(input.publicKey, "la llave pública", 200).toLowerCase(),
      contextRuleId: integer(input.contextRuleId ?? 0, "La regla", { max: 1_000 }),
      isPrimary: input.isPrimary === true,
      label: optionalText(input.label, "el nombre", 40) ?? "",
      birth: birth
        ? ({
            wasmHash: hash32(birth.wasmHash, "El código de la cuenta"),
            transactionHash: hash32(birth.transactionHash, "La transacción de creación"),
            ledger: integer(birth.ledger, "El ledger de creación", { min: 1 }),
            constructorArgsHash: hash32(birth.constructorArgsHash, "El constructor de la cuenta"),
          } satisfies Birth)
        : undefined,
    });
    return kitRecord(record);
  });
}

/** The passkeys of the account of the session. */
export async function GET() {
  return respond(async () => {
    const session = await requireSession();
    return (await credentialsOf(session.address)).map(kitRecord);
  });
}
