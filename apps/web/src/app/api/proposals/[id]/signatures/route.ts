import { respond } from "@/server/errors";
import { body, text } from "@/server/input";
import { addSignature } from "@/server/proposals";
import { requireOwner } from "@/server/session";

// The last signature sends the settlement and waits for the network to confirm it.
export const maxDuration = 60;

/** Adds the signature of the business of the session to a proposal. */
export async function POST(request: Request, context: RouteContext<"/api/proposals/[id]/signatures">) {
  return respond(async () => {
    const session = await requireOwner();
    const { id } = await context.params;
    const input = await body(request);
    await addSignature(id, session.address, text(input.signedEntry, "la firma", 100_000));
    return { ok: true };
  });
}
