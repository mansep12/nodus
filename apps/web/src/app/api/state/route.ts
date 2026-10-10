import { after } from "next/server";
import { refresh } from "@/server/db";
import { respond } from "@/server/errors";
import { tendExampleWorld } from "@/server/examples";
import { requireSession } from "@/server/session";
import { getState } from "@/server/state";

// The neighbours of an example business answer after the response: each of their steps waits for the network.
export const maxDuration = 300;

/** Everything the app shows to the business of the session. `fresh=1` reads the chain first, for right after a transaction. */
export async function GET(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    if (new URL(request.url).searchParams.get("fresh") === "1") await refresh(true);
    after(() => tendExampleWorld(session.address));
    return getState(session);
  });
}
