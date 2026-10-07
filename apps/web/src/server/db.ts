import "server-only";
import path from "node:path";
import { eq } from "drizzle-orm";
import { connect, jobs, type Db } from "@nodus/db";
import { openIds, reconcile, sync } from "@nodus/indexer";
import { NODUS_CONTRACT } from "@/lib/config";
import { chainReader, server } from "./chain";
import { recomputeCandidates } from "./circles";
import { keepAlive } from "./maintenance";
import { notifyChanges } from "./notify";
import { closeStaleProposals } from "./proposals";

// Kept on `globalThis` so that hot reloads in development reuse the connection.
const globals = globalThis as typeof globalThis & { nodusDb?: Promise<Db> };

/** Supabase when DATABASE_URL is set; otherwise an embedded Postgres under .data/. */
export function getDb(): Promise<Db> {
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set: the embedded database cannot run on Vercel, which has no disk to keep it on.");
  }
  return (globals.nodusDb ??= connect({
    url: process.env.DATABASE_URL || undefined,
    dataDir: path.join(process.cwd(), process.env.NODUS_DATA_DIR || ".data", "postgres"),
    migrationsFolder: path.join(process.cwd(), "..", "..", "packages", "db", "migrations"),
  }).catch((error) => {
    // Let the next request try again instead of remembering the failure.
    globals.nodusDb = undefined;
    throw error;
  }));
}

const FRESHNESS_MS = 2_000;
/** How often the proposals are checked for expiry even when nothing happened on chain. */
const STALE_CHECK_MS = 30_000;
let syncing: Promise<void> | undefined;
let syncedAt = 0;
let staleCheckedAt = 0;

/** When the copy of the contract was last brought up to date. */
export const lastSyncedAt = () => new Date(syncedAt);

/**
 * Brings the database up to date with the contract's events, and does what
 * follows from them: closes proposals that can no longer complete, searches
 * for circles again and tells the businesses concerned. Reads are served from
 * a copy at most a couple of seconds old; pass `now` after sending a
 * transaction to see its effects.
 */
export async function refresh(now = false): Promise<void> {
  if (!now && Date.now() - syncedAt < FRESHNESS_MS) return;
  // A sync already under way may have read the chain before the caller's transaction.
  if (now && syncing) await syncing.catch(() => {});
  syncing ??= (async () => {
    try {
      const db = await getDb();
      const startLedger = Number(process.env.NODUS_DEPLOY_LEDGER) || undefined;
      const result = await sync(db, { server, contractId: NODUS_CONTRACT, startLedger });
      syncedAt = Date.now();
      if (result.gap) await reconcile(db, { contractId: NODUS_CONTRACT, reader: chainReader });
      if (result.applied > 0 || result.gap || Date.now() - staleCheckedAt > STALE_CHECK_MS) {
        staleCheckedAt = Date.now();
        await afterChange(db);
      }
    } finally {
      syncing = undefined;
    }
  })();
  await syncing;
}

/** What follows a change in the debts or the proposals: new circles, closed proposals, notices. */
export async function afterChange(db: Db): Promise<void> {
  await closeStaleProposals(db);
  await recomputeCandidates(db);
  await notifyChanges(db).catch((error) => console.error("Could not send notifications", error));
}

const DAY_MS = 24 * 60 * 60_000;

/** Runs a job if `every` has gone by since it last ran. */
async function periodically(db: Db, name: string, every: number, job: () => Promise<void>): Promise<boolean> {
  const [row] = await db.select().from(jobs).where(eq(jobs.name, name));
  if (row && Date.now() - row.ranAt.getTime() < every) return false;
  await job();
  await db
    .insert(jobs)
    .values({ name, ranAt: new Date() })
    .onConflictDoUpdate({ target: jobs.name, set: { ranAt: new Date() } });
  return true;
}

/**
 * The maintenance that keeps the installation healthy when nobody has the
 * app open: catches up with the chain, keeps open debts from expiring and
 * squares the copy with the contract once a day. Run from a scheduler.
 */
export async function maintain(): Promise<{ synced: boolean; keptAlive: boolean; reconciled: boolean }> {
  await refresh(true);
  const db = await getDb();
  const keptAlive = await periodically(db, "keep-alive", 7 * DAY_MS, async () => {
    const ids = await openIds(db, NODUS_CONTRACT);
    if (ids.length > 0) await keepAlive(ids);
  });
  const reconciled = await periodically(db, "reconcile", DAY_MS, async () => {
    const changed = await reconcile(db, { contractId: NODUS_CONTRACT, reader: chainReader });
    if (changed > 0) await afterChange(db);
  });
  return { synced: true, keptAlive, reconciled };
}
