import "server-only";
import path from "node:path";
import { connect, type Db } from "@nodus/db";
import { sync } from "@nodus/indexer";
import { NODUS_CONTRACT } from "@/lib/config";
import { server } from "./chain";

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
let syncing: Promise<void> | undefined;
let syncedAt = 0;

/**
 * Brings the database up to date with the contract's events. Reads are served
 * from a copy at most a couple of seconds old; pass `now` after sending a
 * transaction to see its effects.
 */
export async function refresh(now = false): Promise<void> {
  if (!now && Date.now() - syncedAt < FRESHNESS_MS) return;
  // A sync already under way may have read the chain before the caller's transaction.
  if (now && syncing) await syncing.catch(() => {});
  syncing ??= (async () => {
    try {
      const startLedger = Number(process.env.NODUS_DEPLOY_LEDGER) || undefined;
      await sync(await getDb(), { server, contractId: NODUS_CONTRACT, startLedger });
      syncedAt = Date.now();
    } finally {
      syncing = undefined;
    }
  })();
  await syncing;
}
