import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@nodus/db";
import { getDb } from "@/server/db";
import { respond, UserError } from "@/server/errors";
import { body, text } from "@/server/input";
import { LIMITS } from "@/server/limits";
import { pushPublicKey } from "@/server/notify";
import { requireSession } from "@/server/session";

/** Remembers where to send the business's notices. */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    await LIMITS.writesPerAddress(session.address);
    if (!pushPublicKey()) throw new UserError("Esta instalación no envía notificaciones.");
    const input = await body(request);
    const subscription = input.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
    const endpoint = text(subscription?.endpoint, "la suscripción", 2_000);
    if (!/^https:\/\//.test(endpoint)) throw new UserError("La suscripción no es válida.");
    const keys = {
      p256dh: text(subscription?.keys?.p256dh, "la suscripción", 500),
      auth: text(subscription?.keys?.auth, "la suscripción", 500),
    };
    const db = await getDb();
    await db
      .insert(pushSubscriptions)
      .values({ endpoint, address: session.address, keys })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { address: session.address, keys } });
    return { ok: true };
  });
}

/** Stops the notices to one browser. */
export async function DELETE(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    const input = await body(request);
    const endpoint = text(input.endpoint, "la suscripción", 2_000);
    const db = await getDb();
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.address, session.address)));
    return { ok: true };
  });
}
