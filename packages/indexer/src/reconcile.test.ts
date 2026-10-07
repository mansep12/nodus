import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Address, Keypair, nativeToScVal, type rpc } from "@stellar/stellar-sdk";
import { connect, cursors, events, obligations, type Db } from "@nodus/db";
import { openIds, reconcile, sync, type ChainReader, type StoredObligation } from "./index.ts";

const CONTRACT = "CDKSBPDGPP2R5BBYFNVAVYLOAPAR2SLG3HSMNIUKMY24T76KZXXEIPPD";
const A = Keypair.random().publicKey();
const B = Keypair.random().publicKey();
const OTHER_CONTRACT = "CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K";

type Status = (typeof obligations.$inferInsert)["status"];

/** An obligation of A to B as the copy has it. */
const row = (id: bigint, status: Status, amount = 100n, contractId = CONTRACT) => ({
  contractId,
  id,
  creditor: B,
  debtor: A,
  amount,
  originalAmount: amount,
  status,
  registeredAt: new Date(Date.UTC(2026, 9, 1)),
});

/** An obligation of A to B as the contract stores it. */
const stored = (amount: bigint, accepted: boolean, extra: Partial<StoredObligation> = {}): StoredObligation => ({
  debtor: A,
  creditor: B,
  amount,
  accepted,
  reference: null,
  due: null,
  ...extra,
});

/** A contract whose obligation `i` is `chain[i]`, null once it is no longer stored. */
function reader(chain: Array<StoredObligation | null>): ChainReader {
  return {
    count: async () => BigInt(chain.length),
    obligations: async (ids) => new Map(ids.map((id) => [id, chain[Number(id)] ?? null])),
  };
}

const copy = () => db.select().from(obligations).orderBy(obligations.id);

let db: Db;
beforeAll(async () => {
  db = await connect();
});
beforeEach(async () => {
  await db.delete(obligations);
  await db.delete(events);
  await db.delete(cursors);
});

describe("reconcile", () => {
  test("adds the obligations the copy never saw, accepted or not as the contract says", async () => {
    const reference = new Uint8Array(32).fill(0xab);
    const chain = [stored(100n, true, { reference, due: 1_790_000_000n }), stored(50n, false), null];

    expect(await reconcile(db, { contractId: CONTRACT, reader: reader(chain) })).toBe(2);

    // The third one is gone from the contract too: there is nothing to add.
    expect(await copy()).toEqual([
      expect.objectContaining({
        id: 0n,
        debtor: A,
        creditor: B,
        amount: 100n,
        originalAmount: 100n,
        status: "accepted",
        reference: "ab".repeat(32),
        dueAt: new Date(1_790_000_000 * 1000),
      }),
      expect.objectContaining({ id: 1n, amount: 50n, originalAmount: 50n, status: "pending", reference: null, dueAt: null }),
    ]);
  });

  test("marks as expired an open obligation the contract no longer has", async () => {
    await db.insert(obligations).values([row(0n, "pending"), row(1n, "accepted")]);

    expect(await reconcile(db, { contractId: CONTRACT, reader: reader([null, null]) })).toBe(2);

    expect((await copy()).map((obligation) => obligation.status)).toEqual(["expired", "expired"]);
  });

  test("corrects the amount and the acceptance of the obligations it has", async () => {
    await db.insert(obligations).values([row(0n, "pending", 100n), row(1n, "accepted", 50n)]);

    expect(await reconcile(db, { contractId: CONTRACT, reader: reader([stored(70n, true), stored(30n, true)]) })).toBe(2);

    expect(await copy()).toEqual([
      expect.objectContaining({ id: 0n, amount: 70n, originalAmount: 100n, status: "accepted" }),
      expect.objectContaining({ id: 1n, amount: 30n, originalAmount: 50n, status: "accepted" }),
    ]);
  });

  test("leaves alone the rows that already agree and the ones already closed", async () => {
    const rows = [row(0n, "accepted", 100n), row(1n, "pending", 40n), row(2n, "settled", 0n), row(3n, "cancelled", 20n)];
    await db.insert(obligations).values(rows);
    const before = await copy();

    // Closed obligations leave the contract's storage, which is no reason to call them expired.
    const chain = [stored(100n, true), stored(40n, false), null, null];
    expect(await reconcile(db, { contractId: CONTRACT, reader: reader(chain) })).toBe(0);

    expect(await copy()).toEqual(before);
  });

  test("only touches the obligations of the given contract", async () => {
    await db.insert(obligations).values(row(0n, "pending", 100n, OTHER_CONTRACT));

    expect(await reconcile(db, { contractId: CONTRACT, reader: reader([stored(10n, true)]) })).toBe(1);

    const rows = await db.select().from(obligations).orderBy(obligations.contractId);
    expect(rows.map(({ contractId, amount, status }) => ({ contractId, amount, status }))).toEqual([
      { contractId: OTHER_CONTRACT, amount: 100n, status: "pending" },
      { contractId: CONTRACT, amount: 10n, status: "accepted" },
    ]);
  });
});

describe("openIds", () => {
  test("lists only the pending and accepted obligations of the contract, in order", async () => {
    await db
      .insert(obligations)
      .values([
        row(5n, "accepted"),
        row(0n, "pending"),
        row(1n, "settled"),
        row(2n, "cancelled"),
        row(3n, "rejected"),
        row(4n, "expired"),
        row(6n, "pending"),
        row(7n, "accepted", 100n, OTHER_CONTRACT),
      ]);

    expect(await openIds(db, CONTRACT)).toEqual([0n, 5n, 6n]);
  });

  test("is empty when nothing is open", async () => {
    expect(await openIds(db, CONTRACT)).toEqual([]);
  });
});

/** The oldest ledger the fake RPC still keeps. */
const OLDEST_LEDGER = 50;
const cursorAt = (ledger: number) => `${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-0000000000`;

/** An RPC that keeps one `registered` event per amount, each in its own ledger starting at 100. */
function fakeRpc(amounts: bigint[]) {
  const all = amounts.map((amount, index) => {
    const ledger = 100 + index;
    return {
      id: cursorAt(ledger),
      type: "contract",
      ledger,
      ledgerClosedAt: new Date(Date.UTC(2026, 9, 3, 12, 0, index)).toISOString(),
      transactionIndex: 0,
      operationIndex: 0,
      inSuccessfulContractCall: true,
      txHash: `tx${index}`,
      topic: [nativeToScVal("registered", { type: "symbol" }), nativeToScVal(BigInt(index), { type: "u64" })],
      value: nativeToScVal({ amount, creditor: new Address(B), debtor: new Address(A) }),
    } as unknown as rpc.Api.EventResponse;
  });
  const latestLedger = 100 + all.length;

  return {
    getHealth: async () => ({ oldestLedger: OLDEST_LEDGER }),
    getEvents: async (request: rpc.Api.GetEventsRequest) => {
      // Like the real RPC, it refuses to read from before what it still keeps.
      const from = request.cursor ? Number(BigInt(request.cursor.split("-")[0]!) >> 32n) : request.startLedger!;
      if (from < OLDEST_LEDGER) {
        throw { code: -32600, message: `startLedger must be within the ledger range: ${OLDEST_LEDGER} - ${latestLedger}` };
      }
      const after = request.cursor ?? "";
      const page = all.filter((event) => event.id > after).slice(0, request.limit);
      const endOfLatest = `${((BigInt(latestLedger) << 32n) - 1n).toString().padStart(19, "0")}-4294967295`;
      return { events: page, cursor: page.at(-1)?.id ?? endOfLatest, latestLedger };
    },
  } as unknown as rpc.Server;
}

describe("sync", () => {
  test("reports a gap when it last read before what the RPC still keeps", async () => {
    await db.insert(cursors).values({ contractId: CONTRACT, cursor: cursorAt(10) });

    expect(await sync(db, { server: fakeRpc([100n]), contractId: CONTRACT })).toEqual({ applied: 1, gap: true });
  });

  test("reports no gap when it carries on from where it left off", async () => {
    const server = fakeRpc([100n, 50n]);

    expect(await sync(db, { server, contractId: CONTRACT })).toEqual({ applied: 2, gap: false });
    expect(await sync(db, { server, contractId: CONTRACT })).toEqual({ applied: 0, gap: false });
  });
});
