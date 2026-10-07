/**
 * Tells businesses, through the browser's push notifications, that something
 * waits for them: a debt to accept, a circle to sign, a circle settled. Each
 * notice goes out once.
 */
import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import webPush from "web-push";
import { authorizations, businesses, notifications, obligations, proposals, pushSubscriptions, type Db } from "@nodus/db";
import { NODUS_CONTRACT, TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import { cachedCandidates } from "./circles";

/** Only what happened recently is worth a notice; older things are just history. */
const RECENT_MS = 24 * 60 * 60_000;

interface Notice {
  /** `kind:subject`, which with the address makes the notice unique. */
  id: string;
  kind: string;
  address: string;
  title: string;
  body: string;
  /** Where in the app the notice points. */
  url: string;
}

/** The public key browsers subscribe with, or null when the installation cannot send notices. */
export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

let configured = false;
function configure(): boolean {
  if (!pushPublicKey()) return false;
  if (!configured) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:hola@nodus.cl",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

/** Works out what is new for whom and sends each notice once. */
export async function notifyChanges(db: Db): Promise<number> {
  if (!configure()) return 0;
  const subscribed = await db.select().from(pushSubscriptions);
  if (subscribed.length === 0) return 0;
  const addresses = new Set(subscribed.map((row) => row.address));

  const notices = (await pendingNotices(db, addresses)).filter((notice) => addresses.has(notice.address));
  if (notices.length === 0) return 0;
  const already = new Set(
    (
      await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(inArray(notifications.id, notices.map(noticeKey)))
    ).map((row) => row.id),
  );

  let sent = 0;
  for (const notice of notices) {
    const key = noticeKey(notice);
    if (already.has(key)) continue;
    const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url });
    for (const subscription of subscribed.filter((row) => row.address === notice.address)) {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, { TTL: 60 * 60 });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // The browser let the subscription go: forget it.
        if (status === 404 || status === 410)
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        else console.error("Could not push a notice", error);
      }
    }
    await db.insert(notifications).values({ id: key, address: notice.address, kind: notice.kind }).onConflictDoNothing();
  }
  return sent;
}

const noticeKey = (notice: Notice) => `${notice.id}:${notice.address}`;

/** Everything that would deserve a notice right now, for the addresses that can get one. */
async function pendingNotices(db: Db, addresses: Set<string>): Promise<Notice[]> {
  const since = new Date(Date.now() - RECENT_MS);
  const here = eq(obligations.contractId, NODUS_CONTRACT);
  const names = new Map((await db.select().from(businesses)).map((row) => [row.address, row.name]));
  const nameOf = (address: string) => names.get(address) ?? "Un negocio";
  const notices: Notice[] = [];

  // Debts registered against a business that it has not accepted.
  const toAccept = await db
    .select()
    .from(obligations)
    .where(and(here, eq(obligations.status, "pending"), gt(obligations.registeredAt, since)));
  for (const debt of toAccept) {
    if (!addresses.has(debt.debtor)) continue;
    notices.push({
      id: `debt:${debt.id}`,
      kind: "debt",
      address: debt.debtor,
      title: "Una deuda espera tu firma",
      body: `${nameOf(debt.creditor)} registró que le debes ${formatAmount(debt.amount)} ${TOKEN_SYMBOL}.`,
      url: "/bandeja",
    });
  }

  // Circles being signed that still wait for a signature.
  const open = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.contractId, NODUS_CONTRACT), inArray(proposals.status, ["open", "settled"]), gt(proposals.createdAt, since)))
    .orderBy(desc(proposals.createdAt));
  const rows = open.length
    ? await db
        .select()
        .from(authorizations)
        .where(
          inArray(
            authorizations.proposalId,
            open.map((p) => p.id),
          ),
        )
    : [];
  for (const proposal of open) {
    const parties = rows.filter((row) => row.proposalId === proposal.id);
    const cleared = proposal.clearings.reduce((sum, c) => sum + BigInt(c.amount), 0n);
    for (const party of parties) {
      if (!addresses.has(party.address)) continue;
      if (proposal.status === "open" && !party.signedEntry) {
        notices.push({
          id: `sign:${proposal.id}`,
          kind: "sign",
          address: party.address,
          title: "Falta tu firma en un círculo",
          body: `Se cancelan ${formatAmount(cleared)} ${TOKEN_SYMBOL} entre ${parties.length} negocios. Los demás ya están firmando.`,
          url: `/bandeja?circulo=${proposal.key}`,
        });
      } else if (proposal.status === "settled") {
        notices.push({
          id: `settled:${proposal.id}`,
          kind: "settled",
          address: party.address,
          title: "Círculo desanudado",
          body: `Se cancelaron ${formatAmount(cleared)} ${TOKEN_SYMBOL} en una sola transacción.`,
          url: "/historial",
        });
      }
    }
  }

  // Circles found that nobody has started signing.
  const found = await cachedCandidates(db);
  for (const candidate of found.candidates) {
    const key = candidate.full.clearings.map((c) => `${c.id}:${c.amount}`).join(",");
    for (const party of candidate.full.parties) {
      if (!addresses.has(party.address)) continue;
      notices.push({
        id: `found:${key}`,
        kind: "found",
        address: party.address,
        title: "Nodus encontró un círculo",
        body: `Se pueden cancelar ${formatAmount(candidate.full.cleared)} ${TOKEN_SYMBOL} entre ${candidate.full.parties.length} negocios. Revisa tu bandeja.`,
        url: "/bandeja",
      });
    }
  }
  return notices;
}
