import { after } from "next/server";
import { respond } from "@/server/errors";
import { tendExampleWorld } from "@/server/examples";
import { body, text } from "@/server/input";
import { LIMITS } from "@/server/limits";
import { addSignature } from "@/server/proposals";
import { requireOwner } from "@/server/session";

// The last signature sends the settlement and waits for the network to confirm it,
// and the neighbours of an example business sign after the response.
export const maxDuration = 300;

/** Adds the signature of the business of the session to a proposal. */
export async function POST(request: Request, context: RouteContext<"/api/proposals/[id]/signatures">) {
  return respond(async () => {
    const session = await requireOwner();
    await LIMITS.writesPerAddress(session.address);
    const { id } = await context.params;
    const input = await body(request);
    await addSignature(id, session.address, text(input.signedEntry, "la firma", 100_000));
    after(() => tendExampleWorld(session.address));
    return { ok: true };
  });
}
