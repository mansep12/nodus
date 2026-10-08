import { beforeEach, describe, expect, mock, test } from "bun:test";
import { connect, obligations, proposals } from "@nodus/db";

const NODUS = process.env.NEXT_PUBLIC_NODUS_CONTRACT!;

const db = await connect();
// Bun fixes the shape of a mocked module the first time it loads: every stand-in for the database offers the same names.
mock.module("@/server/db", () => ({ getDb: async () => db, refresh: async () => {} }));
// Asking the network what the parties must authorize is as far as these tests go.
const simulated = new Error("simulated");
mock.module("@/server/chain", () => ({
  nodus: {
    settle: async () => {
      throw simulated;
    },
  },
  server: {},
  accountRule: async () => undefined,
  passkeySigners: () => [],
  tokenBalance: async () => 0n,
  latestLedger: async () => 1_000,
  forgetBalances: () => {},
  forgetRules: () => {},
  isSmartAccount: async () => false,
}));
const { requestSignature } = await import("./proposals");

/** A owes B, B owes C and C owes A the same amount: a circle that moves no money. */
const circle = [
  { id: 0n, debtor: "A", creditor: "B" },
  { id: 1n, debtor: "B", creditor: "C" },
  { id: 2n, debtor: "C", creditor: "A" },
];
const clearings = circle.map(({ id }) => ({ id, amount: 70n }));

beforeEach(async () => {
  await db.delete(proposals);
  await db.delete(obligations);
  await db.insert(obligations).values(
    circle.map((debt) => ({
      ...debt,
      contractId: NODUS,
      amount: 70n,
      originalAmount: 70n,
      status: "accepted" as const,
      registeredAt: new Date(),
    })),
  );
});

describe("requestSignature", () => {
  test("a business outside the circle cannot start its proposal", async () => {
    await expect(requestSignature(clearings, "D")).rejects.toThrow("no participa");

    expect(await db.select().from(proposals)).toEqual([]);
  });

  test("a party of the circle gets as far as asking the network", async () => {
    await expect(requestSignature(clearings, "A")).rejects.toBe(simulated);
  });

  test("a circle the search does not offer cannot be started", async () => {
    await expect(requestSignature([{ id: 0n, amount: 70n }], "A")).rejects.toThrow("ya no está disponible");
  });
});
