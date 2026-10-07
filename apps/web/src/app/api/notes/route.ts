import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { notes, obligations } from "@nodus/db";
import { NODUS_CONTRACT } from "@/lib/config";
import { getDb, refresh } from "@/server/db";
import { respond, UserError } from "@/server/errors";
import { body, text } from "@/server/input";
import { LIMITS } from "@/server/limits";
import { requireSession } from "@/server/session";

/**
 * Keeps the text behind a debt's reference hash (an invoice number, say).
 * Only a party of the debt may write it, and only if the hash on chain is
 * the hash of the text, so what is kept is what was committed to.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    await LIMITS.writesPerAddress(session.address);
    const input = await body(request);
    if (!/^\d{1,20}$/.test(String(input.obligationId))) throw new UserError("La deuda no es válida.");
    const obligationId = BigInt(String(input.obligationId));
    const reference = text(input.text, "la referencia", 120).trim();

    await refresh(true);
    const db = await getDb();
    const [debt] = await db
      .select()
      .from(obligations)
      .where(
        and(
          eq(obligations.contractId, NODUS_CONTRACT),
          eq(obligations.id, obligationId),
          or(eq(obligations.debtor, session.address), eq(obligations.creditor, session.address)),
        ),
      );
    if (!debt) throw new UserError("Esa deuda no es tuya.");
    if (!debt.reference) throw new UserError("Esa deuda no lleva referencia.");
    if (createHash("sha256").update(reference).digest("hex") !== debt.reference)
      throw new UserError("El texto no coincide con la referencia registrada.");
    await db
      .insert(notes)
      .values({ contractId: NODUS_CONTRACT, obligationId, text: reference })
      .onConflictDoUpdate({ target: [notes.contractId, notes.obligationId], set: { text: reference } });
    return { ok: true };
  });
}
