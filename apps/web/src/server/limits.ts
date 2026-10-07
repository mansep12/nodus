/**
 * Rate limits kept in the database, so that they hold across the instances
 * of the app. Each key counts within a fixed window.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { rateLimits } from "@nodus/db";
import { getDb } from "./db";
import { RateLimited } from "./errors";

/** Where a request comes from, as the platform in front reports it. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}

/**
 * Counts one more use of `key` and refuses once `limit` is reached within
 * `windowMs`. Atomic: concurrent requests cannot slip past the limit together.
 */
export async function consume(key: string, limit: number, windowMs: number): Promise<void> {
  // Automated tests create accounts and ask for test tokens far more often than a person would.
  if (process.env.NODUS_RATE_LIMITS === "off" && process.env.NODE_ENV !== "production") return;
  const db = await getDb();
  const resetAt = new Date(Date.now() + windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} < now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} < now() then ${resetAt.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });
  if (row && row.count > limit) throw new RateLimited(row.resetAt);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The limits of the API, in one place. */
export const LIMITS = {
  /** Test tokens: a few times per account and per address per day. */
  faucetPerAddress: (address: string) => consume(`faucet:${address}`, 3, DAY),
  faucetPerIp: (ip: string) => consume(`faucet:ip:${ip}`, 20, DAY),
  /** Accounts the relayer pays for: creating them is the costly call. */
  accountsPerIp: (ip: string) => consume(`relay:create:${ip}`, 30, HOUR),
  relayPerIp: (ip: string) => consume(`relay:${ip}`, 120, HOUR),
  /** Passkey challenges and sessions. */
  sessionPerIp: (ip: string) => consume(`session:${ip}`, 60, HOUR),
  /** Searches of the directory. */
  directoryPerIp: (ip: string) => consume(`directory:${ip}`, 120, HOUR),
  /** Invitations and other writes that need a session. */
  writesPerAddress: (address: string) => consume(`writes:${address}`, 120, HOUR),
};
