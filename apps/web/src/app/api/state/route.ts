import { refresh } from "@/server/db";
import { respond } from "@/server/errors";
import { requireSession } from "@/server/session";
import { getState } from "@/server/state";

/** Everything the app shows to the business of the session. `fresh=1` reads the chain first, for right after a transaction. */
export async function GET(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    if (new URL(request.url).searchParams.get("fresh") === "1") await refresh(true);
    return getState(session);
  });
}
