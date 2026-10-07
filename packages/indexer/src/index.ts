/**
 * Keeps the database copy of the contract's obligations up to date by reading
 * the contract's events from the RPC, and squares it with the contract's own
 * storage when events may have been missed.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
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

export interface SyncResult {
  /** How many events were new. */
  applied: number;
  /** Whether events before the RPC's retention window were skipped, so the copy may be out of date. */
  gap: boolean;
}

/**
 * Applies every event emitted since the last call and returns how many were new.
 * Safe to call concurrently and to repeat: each event is applied exactly once.
 *
 * The RPC only keeps about a week of events. If more than that goes by between
 * calls, the events in the gap are lost and the copy can be out of date; it
 * carries on from the oldest ledger still available and reports the gap, so
 * that the caller can `reconcile`.
 */
export async function sync(db: Db, { server, contractId, startLedger }: SyncOptions): Promise<SyncResult> {
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [contractId] }];
  const [stored] = await db.select().from(cursors).where(eq(cursors.contractId, contractId));
  let cursor = stored?.cursor;
  let applied = 0;
  let gap = false;

  const fromTheStart = async () => {
    const earliest = (await server.getHealth()).oldestLedger + LEDGERS_OF_MARGIN;
    return server.getEvents({ filters, startLedger: Math.max(startLedger ?? 0, earliest), limit: PAGE_SIZE });
  };

  for (;;) {
    const page = cursor
      ? await server.getEvents({ filters, cursor, limit: PAGE_SIZE }).catch((error) => {
          if (!isOutOfRange(error)) throw error;
          console.warn(`Events of ${contractId} before the RPC's retention window were missed`);
          gap = true;
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
    if (page.events.length === 0 && ledgerOf(cursor) + 1 >= page.latestLedger) return { applied, gap };
  }
}

/** Whether the RPC refused a request because it no longer keeps the ledgers asked for. */
const isOutOfRange = (error: unknown) => /within the ledger range/.test(String((error as { message?: unknown } | null)?.message ?? error));

/** Event cursors start with a number whose upper 32 bits are the ledger. */
const ledgerOf = (cursor: string) => Number(BigInt(cursor.split("-")[0]!) >> 32n);

/** Event data as it is stored: amounts as decimal strings, bytes as hex. */
function plain(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

const hex = (value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString("hex") : null);
const dueDate = (value: unknown) => (typeof value === "bigint" || typeof value === "number" ? new Date(Number(value) * 1000) : null);

async function apply(tx: Transaction, contractId: string, event: rpc.Api.EventResponse): Promise<boolean> {
  if (!event.inSuccessfulContractCall) return false;

  const [type, id] = event.topic.map((topic) => scValToNative(topic)) as [string, bigint | undefined];
  const data = (scValToNative(event.value) ?? {}) as Record<string, unknown>;
  const closedAt = new Date(event.ledgerClosedAt);

  const logged = await tx
    .insert(events)
    .values({
      id: event.id,
      contractId,
      type,
      obligationId: id,
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, plain(value)])),
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
        await tx
          .insert(obligations)
          .values({
            contractId,
            id,
            creditor: data.creditor as string,
            debtor: data.debtor as string,
            amount: data.amount as bigint,
            originalAmount: data.amount as bigint,
            status: "pending",
            reference: hex(data.reference),
            dueAt: dueDate(data.due),
            registeredAt: closedAt,
          })
          .onConflictDoNothing();
        break;
      case "accepted":
        await tx.update(obligations).set({ status: "accepted" }).where(obligation);
        break;
      case "rejected":
        await tx.update(obligations).set({ status: "rejected" }).where(obligation);
        break;
      case "cancelled":
        await tx.update(obligations).set({ status: "cancelled" }).where(obligation);
        break;
      case "paid": {
        const remaining = data.remaining as bigint;
        await tx
          .update(obligations)
          .set({
            amount: remaining,
            paid: sql`${obligations.paid} + ${(data.amount as bigint).toString()}`,
            ...(remaining === 0n ? { status: "settled" as const } : {}),
          })
          .where(obligation);
        break;
      }
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

/** An obligation as the contract stores it. */
export interface StoredObligation {
  debtor: string;
  creditor: string;
  amount: bigint;
  accepted: boolean;
  reference: Uint8Array | null;
  due: bigint | null;
}

/** Reads the contract's storage directly, for when events are not enough. */
export interface ChainReader {
  /** How many obligations the contract has ever registered. */
  count(): Promise<bigint>;
  /** The given obligations, null for those no longer stored. */
  obligations(ids: bigint[]): Promise<Map<bigint, StoredObligation | null>>;
}

const BATCH = 100;

/**
 * Squares the copy with the contract's storage: adds obligations the copy
 * never saw, fixes the amount and acceptance of the ones it has, and marks as
 * `expired` those the contract no longer stores for a reason the copy did not
 * see. Returns how many rows changed.
 */
export async function reconcile(db: Db, { contractId, reader }: { contractId: string; reader: ChainReader }): Promise<number> {
  const known = await db
    .select({ id: obligations.id, amount: obligations.amount, status: obligations.status })
    .from(obligations)
    .where(eq(obligations.contractId, contractId));
  const byId = new Map(known.map((row) => [row.id, row]));
  const count = await reader.count();

  const toCheck: bigint[] = [];
  for (let id = 0n; id < count; id++) {
    const row = byId.get(id);
    if (!row || row.status === "pending" || row.status === "accepted") toCheck.push(id);
  }

  let changed = 0;
  for (let at = 0; at < toCheck.length; at += BATCH) {
    const ids = toCheck.slice(at, at + BATCH);
    const stored = await reader.obligations(ids);
    for (const id of ids) {
      const chain = stored.get(id) ?? null;
      const row = byId.get(id);
      if (!row) {
        if (!chain) continue;
        await db
          .insert(obligations)
          .values({
            contractId,
            id,
            creditor: chain.creditor,
            debtor: chain.debtor,
            amount: chain.amount,
            originalAmount: chain.amount,
            status: chain.accepted ? "accepted" : "pending",
            reference: chain.reference ? Buffer.from(chain.reference).toString("hex") : null,
            dueAt: dueDate(chain.due),
            registeredAt: new Date(),
          })
          .onConflictDoNothing();
        changed++;
      } else if (!chain) {
        await db
          .update(obligations)
          .set({ status: "expired" })
          .where(and(eq(obligations.contractId, contractId), eq(obligations.id, id)));
        changed++;
      } else {
        const status = chain.accepted ? "accepted" : "pending";
        if (row.amount !== chain.amount || row.status !== status) {
          await db
            .update(obligations)
            .set({ amount: chain.amount, status })
            .where(and(eq(obligations.contractId, contractId), eq(obligations.id, id)));
          changed++;
        }
      }
    }
  }
  return changed;
}

/** The ids of the obligations still open, for keeping them alive on chain. */
export async function openIds(db: Db, contractId: string): Promise<bigint[]> {
  const rows = await db
    .select({ id: obligations.id })
    .from(obligations)
    .where(and(eq(obligations.contractId, contractId), inArray(obligations.status, ["pending", "accepted"])))
    .orderBy(asc(obligations.id));
  return rows.map((row) => row.id);
}
