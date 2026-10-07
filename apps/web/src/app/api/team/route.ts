import { respond } from "@/server/errors";
import { body, text } from "@/server/input";
import { LIMITS } from "@/server/limits";
import { requireOwner, requireSession } from "@/server/session";
import { dropCredential, team } from "@/server/team";

/** The passkeys and invitations of the account of the session. */
export async function GET() {
  return respond(async () => {
    const session = await requireSession();
    return team(session.address, session.credentialId);
  });
}

/** Forgets a passkey the account no longer lists on chain. */
export async function DELETE(request: Request) {
  return respond(async () => {
    const session = await requireOwner();
    await LIMITS.writesPerAddress(session.address);
    const input = await body(request);
    await dropCredential(session.address, text(input.credentialId, "la passkey", 2_000));
    return { ok: true };
  });
}
