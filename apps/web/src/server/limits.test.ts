import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { connect, rateLimits } from "@nodus/db";
import { RateLimited } from "./errors";
import type * as Limits from "./limits";

const db = await connect();
// Bun fixes the shape of a mocked module the first time it loads: every stand-in for the database offers the same names.
mock.module("@/server/db", () => ({ getDb: async () => db, refresh: async () => {} }));
// Bun keeps a module mock for the rest of the run, so the stand-in the relay's tests use may be in place;
// the query string loads the real one.
const limits = "./limits.ts?real";
const { consume } = (await import(limits)) as typeof Limits;

const MINUTE = 60_000;

/** What `consume` throws, or undefined if it lets the call through. */
async function refusal(key: string, limit: number, windowMs = MINUTE): Promise<unknown> {
  try {
    await consume(key, limit, windowMs);
    return undefined;
  } catch (error) {
    return error;
  }
}

beforeEach(async () => {
  await db.delete(rateLimits);
});

describe("consume", () => {
  test("lets `limit` calls through and refuses the next, saying when to try again", async () => {
    const before = Date.now();
    for (let call = 0; call < 3; call++) expect(await refusal("faucet:someone", 3)).toBeUndefined();

    const error = await refusal("faucet:someone", 3);

    expect(error).toBeInstanceOf(RateLimited);
    const retryAt = (error as RateLimited).retryAt.getTime();
    expect(retryAt).toBeGreaterThanOrEqual(before + MINUTE - 1_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + MINUTE + 1_000);
  });

  test("keeps refusing while the window lasts", async () => {
    await consume("relay:1.2.3.4", 1, MINUTE);

    expect(await refusal("relay:1.2.3.4", 1)).toBeInstanceOf(RateLimited);
    expect(await refusal("relay:1.2.3.4", 1)).toBeInstanceOf(RateLimited);
  });

  test("counts each key on its own", async () => {
    await consume("session:1.2.3.4", 1, MINUTE);

    expect(await refusal("session:5.6.7.8", 1)).toBeUndefined();
    expect(await refusal("session:1.2.3.4", 1)).toBeInstanceOf(RateLimited);
  });

  test("starts counting again once the window is over", async () => {
    // A key that used up its limit in a window that has already ended.
    await db.insert(rateLimits).values({ key: "faucet:someone", count: 3, resetAt: new Date(Date.now() - MINUTE) });

    expect(await refusal("faucet:someone", 3)).toBeUndefined();

    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, "faucet:someone"));
    expect(row!.count).toBe(1);
    expect(row!.resetAt.getTime()).toBeGreaterThan(Date.now());
    expect(await refusal("faucet:someone", 3)).toBeUndefined();
    expect(await refusal("faucet:someone", 3)).toBeUndefined();
    expect(await refusal("faucet:someone", 3)).toBeInstanceOf(RateLimited);
  });
});
