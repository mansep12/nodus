import { respond } from "@/server/errors";
import { account, body, text } from "@/server/input";
import { addSignature } from "@/server/proposals";

// The last signature sends the settlement and waits for the network to confirm it.
export const maxDuration = 60;

/** Adds a party's signature to a proposal. */
export async function POST(request: Request, context: RouteContext<"/api/proposals/[id]/signatures">) {
  return respond(async () => {
    const { id } = await context.params;
    const input = await body(request);
    await addSignature(id, account(input.address), text(input.signedEntry, "la firma"));
    return { ok: true };
  });
}
