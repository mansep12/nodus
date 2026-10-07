import { respond, UserError } from "@/server/errors";
import { body, integer, text } from "@/server/input";
import { LIMITS, clientIp } from "@/server/limits";
import { consumeChallenge, requireOwner } from "@/server/session";
import { completeInvitation, describeInvitation, registerInvitee, revokeInvitation } from "@/server/team";

type Context = RouteContext<"/api/invitations/[id]">;

/** What the invitation offers, for the person who opens it. */
export async function GET(_request: Request, context: Context) {
  return respond(async () => describeInvitation((await context.params).id));
}

/**
 * The invitee registered a passkey on its device. The registration is over a
 * challenge from us, so that what gets stored was made for this invitation.
 */
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    await LIMITS.sessionPerIp(clientIp(request));
    const { id } = await context.params;
    const input = await body(request);
    const registration = input.registration as { id?: unknown; response?: { clientDataJSON?: unknown; publicKey?: unknown } } | undefined;
    const credentialId = text(registration?.id, "la passkey", 2_000);
    const clientData = JSON.parse(
      Buffer.from(text(registration?.response?.clientDataJSON, "la passkey", 10_000), "base64url").toString("utf8"),
    ) as {
      type?: unknown;
      challenge?: unknown;
    };
    if (
      clientData.type !== "webauthn.create" ||
      typeof clientData.challenge !== "string" ||
      !(await consumeChallenge(clientData.challenge))
    ) {
      throw new UserError("La passkey no se creó para esta invitación. Intenta de nuevo.");
    }
    const publicKey = Buffer.from(text(registration?.response?.publicKey, "la llave pública", 1_000), "base64url");
    return registerInvitee(id, credentialId, publicKey);
  });
}

/** The owner added the passkey to the account under a rule, and says which. */
export async function PATCH(request: Request, context: Context) {
  return respond(async () => {
    const session = await requireOwner();
    await LIMITS.writesPerAddress(session.address);
    const { id } = await context.params;
    const input = await body(request);
    return completeInvitation(session.address, id, integer(input.ruleId, "La regla", { min: 1, max: 1_000 }));
  });
}

/** The owner withdraws the invitation. */
export async function DELETE(_request: Request, context: Context) {
  return respond(async () => {
    const session = await requireOwner();
    await revokeInvitation(session.address, (await context.params).id);
    return { ok: true };
  });
}
