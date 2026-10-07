import { getDb } from "@/server/db";
import { respond } from "@/server/errors";
import { integer } from "@/server/input";
import { requireSession } from "@/server/session";
import { mySettlements } from "@/server/state";

/** The settlements of the business of the session, a page at a time. */
export async function GET(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const offset = integer(searchParams.get("offset") ?? 0, "La página", { max: 100_000 });
    const limit = integer(searchParams.get("limit") ?? 20, "El tamaño de página", { min: 1, max: 50 });
    return mySettlements(await getDb(), session.address, offset, limit);
  });
}
