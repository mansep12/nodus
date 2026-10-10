import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { businesses } from "@nodus/db";
import type { DirectoryMatch } from "@/lib/types";
import { getDb } from "@/server/db";
import { respond, UserError } from "@/server/errors";
import { directoryScope } from "@/server/examples";
import { account, body, text } from "@/server/input";
import { LIMITS, clientIp } from "@/server/limits";
import { requireOwner, requireSession } from "@/server/session";

/** Names the account of the session. The owner can rename it; the name is a label, not an identity. */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireOwner();
    await LIMITS.writesPerAddress(session.address);
    const input = await body(request);
    const name = text(input.name, "el nombre del negocio", 100).trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) throw new UserError("El nombre debe tener entre 2 y 40 caracteres.");

    const db = await getDb();
    const [sameName] = await db
      .select({ address: businesses.address })
      .from(businesses)
      .where(and(ne(businesses.address, session.address), sql`lower(${businesses.name}) = lower(${name})`))
      .limit(1);
    await db
      .insert(businesses)
      .values({ address: session.address, name })
      .onConflictDoUpdate({ target: businesses.address, set: { name } });
    return {
      address: session.address,
      name,
      warning: sameName ? "Ya hay otro negocio con ese nombre. Los demás los distinguirán solo por la dirección." : undefined,
    };
  });
}

/**
 * Finds businesses to register a debt against: by a piece of their name, or
 * exactly by address. Few results, and only for businesses with a session.
 */
export async function GET(request: Request) {
  return respond(async (): Promise<DirectoryMatch[]> => {
    const session = await requireSession();
    await LIMITS.directoryPerIp(clientIp(request));
    const { searchParams } = new URL(request.url);
    const db = await getDb();

    const address = searchParams.get("address");
    if (address) {
      const [match] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.address, account(address)));
      return match ? [{ address: match.address, name: match.name }] : [];
    }

    const query = (searchParams.get("q") ?? "").trim();
    if (query.length < 2) return [];
    const escaped = query.replace(/[%_\\]/g, (character) => `\\${character}`);
    const rows = await db
      .select()
      .from(businesses)
      .where(and(ne(businesses.address, session.address), ilike(businesses.name, `%${escaped}%`), await directoryScope(session.address)))
      .orderBy(businesses.name)
      .limit(8);
    return rows.map(({ address, name }) => ({ address, name }));
  });
}
