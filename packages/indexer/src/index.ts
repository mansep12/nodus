/**
 * Keeps the database copy of the contract's obligations up to date by reading
 * the contract's events from the RPC.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { cursors, events, obligations, type Db } from "@nodus/db";

type EventSource = Pick<rpc.Server, "getEvents" | "getHealth">;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

const PAGE_SIZE = 200;
// The oldest ledger keeps advancing; without a margin it could be gone by the time we ask for it.
const LEDGERS_OF_MARGIN = 20;

export interface SyncOptions {
  server: EventSource;
  contractId: string;
  /**
   * Where to start the first time: the ledger the contract was deployed in.
   * Defaults to the oldest ledger the RPC still keeps, about a week back.
   */
  startLedger?: number;
}

/**
 * Applies every event emitted since the last call and returns how many were new.
 * Safe to call concurrently and to repeat: each event is applied exactly once.
 *
 * The RPC only keeps about a week of events. If more than that goes by between
 * calls, the events in the gap are lost and the copy can be out of date; it
 * carries on from the oldest ledger still available.
 */
export async function sync(db: Db, { server, contractId, startLedger }: SyncOptions): Promise<number> {
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [contractId] }];
  const [stored] = await db.select().from(cursors).where(eq(cursors.contractId, contractId));
  let cursor = stored?.cursor;
  let applied = 0;

  const fromTheStart = async () => {
    const earliest = (await server.getHealth()).oldestLedger + LEDGERS_OF_MARGIN;
    return server.getEvents({ filters, startLedger: Math.max(startLedger ?? 0, earliest), limit: PAGE_SIZE });
  };

  for (;;) {
    const page = cursor
      ? await server.getEvents({ filters, cursor, limit: PAGE_SIZE }).catch((error) => {
          if (!isOutOfRange(error)) throw error;
          console.warn(`Events of ${contractId} before the RPC's retention window were missed`);
          return fromTheStart();
        })
      : await fromTheStart();

    await db.transaction(async (tx) => {
      for (const event of page.events) {
        if (await apply(tx, contractId, event)) applied++;
      }
      await tx
        .insert(cursors)
        .values({ contractId, cursor: page.cursor })
        .onConflictDoUpdate({ target: cursors.contractId, set: { cursor: page.cursor } });
    });
    cursor = page.cursor;

    // A request scans a bounded range of ledgers, so an empty page only means
    // we are done once the cursor has caught up with the network.
    if (page.events.length === 0 && ledgerOf(cursor) + 1 >= page.latestLedger) return applied;
  }
}

/** Whether the RPC refused a request because it no longer keeps the ledgers asked for. */
const isOutOfRange = (error: unknown) =>
  /within the ledger range/.test(String((error as { message?: unknown } | null)?.message ?? error));

/** Event cursors start with a number whose upper 32 bits are the ledger. */
const ledgerOf = (cursor: string) => Number(BigInt(cursor.split("-")[0]!) >> 32n);

async function apply(tx: Transaction, contractId: string, event: rpc.Api.EventResponse): Promise<boolean> {
  if (!event.inSuccessfulContractCall) return false;

  const [type, id] = event.topic.map((topic) => scValToNative(topic)) as [string, bigint | undefined];
  const data = (scValToNative(event.value) ?? {}) as Record<string, string | number | bigint>;
  const closedAt = new Date(event.ledgerClosedAt);

  const logged = await tx
    .insert(events)
    .values({
      id: event.id,
      contractId,
      type,
      obligationId: id,
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
      ),
      ledger: event.ledger,
      txHash: event.txHash,
      closedAt,
    })
    .onConflictDoNothing()
    .returning({ id: events.id });
  if (logged.length === 0) return false;

  if (id !== undefined) {
    const obligation = and(eq(obligations.contractId, contractId), eq(obligations.id, id));
    switch (type) {
      case "registered":
        await tx.insert(obligations).values({
          contractId,
          id,
          creditor: data.creditor as string,
          debtor: data.debtor as string,
          amount: data.amount as bigint,
          originalAmount: data.amount as bigint,
          status: "pending",
          registeredAt: closedAt,
        });
        break;
      case "accepted":
        await tx.update(obligations).set({ status: "accepted" }).where(obligation);
        break;
      case "cancelled":
        await tx.update(obligations).set({ status: "cancelled" }).where(obligation);
        break;
      case "cleared": {
        const remaining = data.remaining as bigint;
        await tx
          .update(obligations)
          .set(remaining === 0n ? { amount: remaining, status: "settled" } : { amount: remaining })
          .where(obligation);
        break;
      }
    }
  }
  return true;
}

/** The obligations a settlement can include: accepted by the debtor and still owed. */
export async function settleable(db: Db, contractId: string) {
  return db
    .select({
      id: obligations.id,
      debtor: obligations.debtor,
      creditor: obligations.creditor,
      amount: obligations.amount,
    })
    .from(obligations)
    .where(and(eq(obligations.contractId, contractId), eq(obligations.status, "accepted"), gt(obligations.amount, 0n)))
    .orderBy(asc(obligations.id));
}
