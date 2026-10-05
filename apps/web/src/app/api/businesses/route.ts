import { businesses } from "@nodus/db";
import { getDb } from "@/server/db";
import { respond, UserError } from "@/server/errors";
import { account, body, text } from "@/server/input";

/** Gives a smart account its name in the directory. The first name given stays. */
export async function POST(request: Request) {
  return respond(async () => {
    const input = await body(request);
    const address = account(input.address);
    const name = text(input.name, "el nombre del negocio").trim();
    if (name.length < 2 || name.length > 40) throw new UserError("El nombre debe tener entre 2 y 40 caracteres.");

    const db = await getDb();
    await db.insert(businesses).values({ address, name }).onConflictDoNothing();
    return { address, name };
  });
}
