import { beforeEach, describe, expect, test } from "bun:test";
import { Address, Keypair, nativeToScVal, xdr, type rpc } from "@stellar/stellar-sdk";
import { connect, cursors, events, obligations, type Db } from "@nodus/db";
import { settleable, sync } from "./index.ts";

const CONTRACT = "CDKSBPDGPP2R5BBYFNVAVYLOAPAR2SLG3HSMNIUKMY24T76KZXXEIPPD";
/** The oldest ledger the fake RPC still keeps. */
const OLDEST_LEDGER = 50;
const A = Keypair.random().publicKey();
const B = Keypair.random().publicKey();

/** An RPC that has the given events, each in its own ledger starting at 100. */
function fakeRpc(log: Array<[type: string, id: bigint | undefined, data: Record<string, unknown> | xdr.ScVal]>) {
  const all = log.map(([type, id, data], index) => {
    const ledger = 100 + index;
    return {
      id: `${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-0000000000`,
      type: "contract",
      ledger,
      ledgerClosedAt: new Date(Date.UTC(2026, 9, 3, 12, 0, index)).toISOString(),
      transactionIndex: 0,
      operationIndex: 0,
      inSuccessfulContractCall: true,
      txHash: `tx${index}`,
      topic: [nativeToScVal(type, { type: "symbol" }), ...(id === undefined ? [] : [nativeToScVal(id, { type: "u64" })])],
      value: data instanceof xdr.ScVal ? data : nativeToScVal(data),
    } as unknown as rpc.Api.EventResponse;
  });
  const latestLedger = 100 + all.length;
  const requests: rpc.Api.GetEventsRequest[] = [];

  const server = {
    getHealth: async () => ({ oldestLedger: OLDEST_LEDGER }),
    getEvents: async (request: rpc.Api.GetEventsRequest) => {
      requests.push(request);
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
  return { server, requests };
}

const registered = (id: bigint, amount: bigint): [string, bigint, Record<string, unknown>] => [
  "registered",
  id,
  { amount, creditor: new Address(B), debtor: new Address(A) },
];

let db: Db;
beforeEach(async () => {
  db = await connect();
});

describe("sync", () => {
  test("follows an obligation from registration to settlement", async () => {
    const { server } = fakeRpc([registered(0n, 100n), ["accepted", 0n, {}], ["cleared", 0n, { amount: 30n, remaining: 70n }]]);

    expect((await sync(db, { server, contractId: CONTRACT })).applied).toBe(3);

    expect(await db.select().from(obligations)).toEqual([
      {
        contractId: CONTRACT,
        id: 0n,
        creditor: B,
        debtor: A,
        amount: 70n,
        originalAmount: 100n,
        paid: 0n,
        status: "accepted",
        reference: null,
        dueAt: null,
        registeredAt: new Date(Date.UTC(2026, 9, 3, 12, 0, 0)),
      },
    ]);

    const later = fakeRpc([
      registered(0n, 100n),
      ["accepted", 0n, {}],
      ["cleared", 0n, { amount: 30n, remaining: 70n }],
      ["cleared", 0n, { amount: 70n, remaining: 0n }],
      [
        "settled",
        undefined,
        // `parties` is a u32 on chain, which decodes to a number rather than a bigint.
        nativeToScVal(
          { cleared: 70n, moved: 0n, parties: 2 },
          { type: { cleared: ["symbol", "i128"], moved: ["symbol", "i128"], parties: ["symbol", "u32"] } },
        ),
      ],
    ]);
    expect((await sync(db, { server: later.server, contractId: CONTRACT })).applied).toBe(2);

    const [obligation] = await db.select().from(obligations);
    expect(obligation).toMatchObject({ amount: 0n, status: "settled" });
    const log = await db.select().from(events).orderBy(events.id);
    expect(log.map((event) => event.type)).toEqual(["registered", "accepted", "cleared", "cleared", "settled"]);
    expect(log.at(-1)).toMatchObject({
      obligationId: null,
      data: { cleared: "70", moved: "0", parties: 2 },
      txHash: "tx4",
    });
  });

  test("resumes from where it left off", async () => {
    const { server, requests } = fakeRpc([registered(0n, 100n), registered(1n, 50n)]);

    await sync(db, { server, contractId: CONTRACT });
    expect(requests[0]).toMatchObject({ startLedger: 70 });

    requests.length = 0;
    expect((await sync(db, { server, contractId: CONTRACT })).applied).toBe(0);
    const [stored] = await db.select().from(cursors);
    expect(requests).toEqual([expect.objectContaining({ cursor: stored!.cursor })]);
    expect(await db.select().from(obligations)).toHaveLength(2);
  });

  test("starts from the given ledger the first time", async () => {
    const { server, requests } = fakeRpc([]);

    await sync(db, { server, contractId: CONTRACT, startLedger: 90 });

    expect(requests[0]).toMatchObject({ startLedger: 90 });
  });

  test("starts from the oldest ledger kept when the given one is gone", async () => {
    const { server, requests } = fakeRpc([registered(0n, 100n)]);

    expect((await sync(db, { server, contractId: CONTRACT, startLedger: 10 })).applied).toBe(1);

    expect(requests[0]).toMatchObject({ startLedger: 70 });
  });

  test("carries on from the oldest ledger kept when it fell too far behind", async () => {
    const { server, requests } = fakeRpc([registered(0n, 100n)]);
    const longAgo = `${(10n << 32n).toString().padStart(19, "0")}-0000000000`;
    await db.insert(cursors).values({ contractId: CONTRACT, cursor: longAgo });

    expect((await sync(db, { server, contractId: CONTRACT })).applied).toBe(1);

    expect(requests.slice(0, 2)).toEqual([expect.objectContaining({ cursor: longAgo }), expect.objectContaining({ startLedger: 70 })]);
    const [stored] = await db.select().from(cursors);
    expect(stored!.cursor).not.toBe(longAgo);
  });

  test("applies an event only once even if it is delivered again", async () => {
    const { server } = fakeRpc([registered(0n, 100n), ["accepted", 0n, {}], ["cancelled", 0n, {}]]);
    await sync(db, { server, contractId: CONTRACT });

    await db.delete(cursors);
    expect((await sync(db, { server, contractId: CONTRACT })).applied).toBe(0);

    expect(await db.select().from(events)).toHaveLength(3);
    const [obligation] = await db.select().from(obligations);
    expect(obligation!.status).toBe("cancelled");
  });

  test("reads every page", async () => {
    const many = Array.from({ length: 250 }, (_, index) => registered(BigInt(index), 10n));
    const { server, requests } = fakeRpc(many);

    expect((await sync(db, { server, contractId: CONTRACT })).applied).toBe(250);

    // A full page, the rest, and an empty one that confirms there is no more.
    expect(requests.length).toBe(3);
    expect(await db.select().from(obligations)).toHaveLength(250);
  }, 30_000);
});

describe("settleable", () => {
  test("returns only accepted obligations that are still owed", async () => {
    const { server } = fakeRpc([
      registered(0n, 100n),
      registered(1n, 50n),
      registered(2n, 20n),
      registered(3n, 10n),
      ["accepted", 0n, {}],
      ["accepted", 2n, {}],
      ["accepted", 3n, {}],
      ["cleared", 2n, { amount: 20n, remaining: 0n }],
      ["cancelled", 3n, {}],
    ]);
    await sync(db, { server, contractId: CONTRACT });

    expect(await settleable(db, CONTRACT)).toEqual([{ id: 0n, debtor: A, creditor: B, amount: 100n }]);
    expect(await settleable(db, "another contract")).toEqual([]);
  });
});
