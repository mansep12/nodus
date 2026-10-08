import { eq } from "drizzle-orm";
import { businesses } from "@nodus/db";
import { verifyAssertion, type AssertionJSON } from "@nodus/stellar";
import type { SessionView } from "@/lib/types";
import { accountRule, isOwnerRule } from "@/server/chain";
import { credentialsOf, findCredential, kitRecord } from "@/server/credentials";
import { getDb } from "@/server/db";
import { respond, UserError } from "@/server/errors";
import { body, relyingParty, text } from "@/server/input";
import { LIMITS, clientIp } from "@/server/limits";
import { consumeChallenge, endSession, readSession, startSession, type Role } from "@/server/session";

/** The session of the browser, if it has one. */
export async function GET() {
  return respond(async () => {
    const session = await readSession();
    if (!session) return { session: null };
    const db = await getDb();
    const [business] = await db.select().from(businesses).where(eq(businesses.address, session.address));
    return { session: { address: session.address, name: business?.name ?? null, role: session.role, credentialId: session.credentialId } };
  });
}

/**
 * Opens a session from a passkey assertion over a challenge handed out
 * moments ago. The passkey must be one the account answers to; the role of
 * the session follows the rule it signs under.
 */
export async function POST(request: Request) {
  return respond(async (): Promise<SessionView> => {
    await LIMITS.sessionPerIp(clientIp(request));
    const input = await body(request);
    const assertion = assertionOf(input.assertion);

    const credential = await findCredential(assertion.id);
    if (!credential)
      throw new UserError("No conocemos esa passkey. Entra desde el navegador donde creaste la cuenta y vuelve a intentarlo aquí.");
    const client = JSON.parse(Buffer.from(assertion.response.clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    if (typeof client.challenge !== "string" || !(await consumeChallenge(client.challenge))) {
      throw new UserError("La firma llegó tarde o ya se usó. Intenta de nuevo.");
    }
    const party = relyingParty(request);
    const verified = verifyAssertion(assertion, {
      challenge: client.challenge,
      rpId: party.rpId,
      origins: party.origins,
      publicKey: Buffer.from(credential.publicKey, "hex"),
    });
    if (!verified.ok) throw new UserError("La passkey no pudo verificarse.");

    const rule = await accountRule(credential.address, credential.contextRuleId);
    if (!rule) throw new UserError("La cuenta ya no reconoce esa passkey.");
    const role: Role = isOwnerRule(rule) ? "owner" : "clerk";
    await startSession({ address: credential.address, credentialId: credential.credentialId, ruleId: credential.contextRuleId, role });

    const db = await getDb();
    const [business] = await db.select().from(businesses).where(eq(businesses.address, credential.address));
    return {
      address: credential.address,
      name: business?.name ?? null,
      role,
      credentialId: credential.credentialId,
      credentials: (await credentialsOf(credential.address)).map(kitRecord),
    };
  });
}

export async function DELETE() {
  return respond(async () => {
    await endSession();
    return { ok: true };
  });
}

function assertionOf(value: unknown): AssertionJSON {
  const assertion = value as Partial<AssertionJSON> | undefined;
  const response = assertion?.response as Partial<AssertionJSON["response"]> | undefined;
  return {
    id: text(assertion?.id, "la passkey", 2_000),
    response: {
      clientDataJSON: text(response?.clientDataJSON, "la firma", 10_000),
      authenticatorData: text(response?.authenticatorData, "la firma", 10_000),
      signature: text(response?.signature, "la firma", 10_000),
    },
  };
}
