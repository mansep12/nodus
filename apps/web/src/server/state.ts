import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import { authorizations, businesses, events, exampleActors, notes, obligations, proposals } from "@nodus/db";
import { effects, type Clearing, type Obligation } from "@nodus/solver";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "@/lib/config";
import type { BusinessView, CircleView, NetworkStats, PartyView, SettlementOption, SettlementView, StateView } from "@/lib/types";
import { latestLedger, tokenBalance } from "./chain";
import { cachedCandidates, parseClearings } from "./circles";
import { getDb, lastSyncedAt, refresh } from "./db";
import { pushPublicKey } from "./notify";
import { clearingsKey } from "./proposals";
import type { Session } from "./session";

type Proposal = typeof proposals.$inferSelect;
type Db = Awaited<ReturnType<typeof getDb>>;

/** How long a finished proposal stays on screen. */
const RECENT_MS = 15 * 60_000;
/** How many of the viewer's settlements come with the state; the rest are paged. */
const FIRST_SETTLEMENTS = 10;

/**
 * Everything the app shows to one business, read from the database copy of
 * the contract: its own debts, the circles it is part of, the businesses it
 * deals with. The other parties of a circle are not named.
 */
export async function getState(session: Session): Promise<StateView> {
  await refresh();
  const db = await getDb();
  const me = session.address;
  const here = eq(obligations.contractId, NODUS_CONTRACT);

  const [ledger, myObligations, myProposals, found, balance, [mine], network] = await Promise.all([
    latestLedger(),
    db
      .select()
      .from(obligations)
      .where(and(here, or(eq(obligations.debtor, me), eq(obligations.creditor, me))))
      .orderBy(desc(obligations.id)),
    db
      .select({ proposal: proposals })
      .from(proposals)
      .innerJoin(authorizations, eq(authorizations.proposalId, proposals.id))
      .where(
        and(
          eq(proposals.contractId, NODUS_CONTRACT),
          eq(authorizations.address, me),
          or(inArray(proposals.status, ["open", "submitted"]), gt(proposals.createdAt, new Date(Date.now() - RECENT_MS))),
        ),
      )
      .orderBy(desc(proposals.createdAt)),
    cachedCandidates(db),
    tokenBalance(me).catch(() => null),
    db.select().from(businesses).where(eq(businesses.address, me)),
    networkStats(db),
  ]);
  const proposalRows = myProposals.map((row) => row.proposal);
  const noteRows = myObligations.length
    ? await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.contractId, NODUS_CONTRACT),
            inArray(
              notes.obligationId,
              myObligations.map((row) => row.id),
            ),
          ),
        )
    : [];
  const noteOf = new Map(noteRows.map((row) => [row.obligationId, row.text]));
  const candidates = found.candidates.filter((candidate) => candidate.full.parties.some((party) => party.address === me));

  // The debts of every circle, to tell what settling it does to each party.
  const circleIds = new Set<bigint>();
  for (const proposal of proposalRows) for (const clearing of proposal.clearings) circleIds.add(BigInt(clearing.id));
  for (const candidate of candidates) {
    for (const clearing of candidate.full.clearings) circleIds.add(clearing.id);
    for (const clearing of candidate.netOnly?.clearings ?? []) circleIds.add(clearing.id);
  }
  const all = await debtsById(db, [...circleIds], myObligations);
  const proposalIds = proposalRows.map((proposal) => proposal.id);
  const signatureRows = proposalIds.length
    ? await db.select().from(authorizations).where(inArray(authorizations.proposalId, proposalIds))
    : [];
  const viewer = new Viewer(me, all);

  /** A circle someone has started signing. */
  const started = (proposal: Proposal): CircleView => {
    const signed = new Set(signatureRows.filter((row) => row.proposalId === proposal.id && row.signedEntry).map((row) => row.address));
    return {
      ...viewer.option(parseClearings(proposal.clearings), proposal.status === "settled" ? () => true : (a) => signed.has(a)),
      proposal: {
        id: proposal.id,
        status: proposal.status,
        expirationLedger: proposal.expirationLedger,
        txHash: proposal.txHash ?? undefined,
        error: proposal.error ?? undefined,
      },
    };
  };
  const underWay = proposalRows.filter((p) => p.status === "open" || p.status === "submitted").reverse();
  const failed = (key: string) => proposalRows.find((p) => p.key === key && p.status === "failed");

  const circles: CircleView[] = [
    ...underWay.map(started),
    ...candidates.map(({ full, netOnly }): CircleView => {
      const circle = viewer.option(full.clearings, () => false);
      const alternative = netOnly && viewer.option(netOnly.clearings, () => false);
      // If the last attempt at this circle failed, say why.
      const lastAttempt = failed(circle.key) ?? (alternative && failed(alternative.key));
      return { ...circle, netOnly: alternative, proposal: lastAttempt && started(lastAttempt).proposal };
    }),
    ...proposalRows.filter((p) => p.status === "settled").map(started),
  ];

  const { settlements, total } = await mySettlements(db, me, 0, FIRST_SETTLEMENTS, viewer);

  return {
    contract: NODUS_CONTRACT,
    token: TOKEN_CONTRACT,
    ledger,
    syncedAt: lastSyncedAt().toISOString(),
    me: { address: me, name: mine?.name ?? null, role: session.role },
    businesses: await namesOf(db, viewer.counterparties(myObligations)),
    obligations: myObligations.map((row) => ({
      id: row.id.toString(),
      debtor: row.debtor,
      creditor: row.creditor,
      amount: row.amount.toString(),
      originalAmount: row.originalAmount.toString(),
      paid: row.paid.toString(),
      status: row.status,
      registeredAt: row.registeredAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      reference: row.reference,
      note: noteOf.get(row.id) ?? null,
    })),
    circles,
    cutShort: found.cutShort,
    settlements,
    settlementsTotal: total,
    network,
    balance: balance?.toString() ?? null,
    faucet: Boolean(process.env.TOKEN_ISSUER_SECRET),
    push: pushPublicKey(),
  };
}

type ObligationRow = typeof obligations.$inferSelect;

/** The given debts as the solver sees them, taking the viewer's own rows first. */
async function debtsById(db: Db, ids: bigint[], known: ObligationRow[]): Promise<Map<bigint, Obligation>> {
  const byId = new Map<bigint, Obligation>();
  for (const row of known) byId.set(row.id, { id: row.id, debtor: row.debtor, creditor: row.creditor, amount: row.amount });
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const rows = await db
      .select()
      .from(obligations)
      .where(and(eq(obligations.contractId, NODUS_CONTRACT), inArray(obligations.id, missing)));
    for (const row of rows) byId.set(row.id, { id: row.id, debtor: row.debtor, creditor: row.creditor, amount: row.amount });
  }
  return byId;
}

/**
 * Builds what one business sees of a settlement: itself and the two it deals
 * with by address, and every other party behind a marker that changes on
 * every read, so that nothing links one circle's strangers to another's.
 */
class Viewer {
  /** The addresses the viewer dealt with in some circle, to name them. */
  readonly neighbours = new Set<string>();

  constructor(
    readonly me: string,
    readonly debts: Map<bigint, Obligation>,
  ) {}

  /** What settling `clearings` means, and who of its parties `hasSigned`. */
  option(clearings: Clearing[], hasSigned: (address: string) => boolean): SettlementOption {
    // One edge per pair of parties, however many debts link them.
    const edges = new Map<string, { from: string; to: string; amount: bigint }>();
    for (const { id, amount } of clearings) {
      const debt = this.debts.get(id);
      if (!debt) throw new Error(`Unknown obligation ${id}`);
      const edge = edges.get(`${debt.debtor}>${debt.creditor}`);
      if (edge) edge.amount += amount;
      else edges.set(`${debt.debtor}>${debt.creditor}`, { from: debt.debtor, to: debt.creditor, amount });
    }
    const parties = alongTheCircle(effects(clearings, this.debts.values()), [...edges.values()]);
    const known = new Set([this.me]);
    for (const edge of edges.values()) {
      if (edge.from === this.me) known.add(edge.to);
      if (edge.to === this.me) known.add(edge.from);
    }
    for (const address of known) if (address !== this.me) this.neighbours.add(address);
    // Each circle gets its own markers, so that a stranger shared by two circles cannot be matched between them.
    const aliases = new Map<string, string>();
    const shown = (address: string) => {
      if (known.has(address)) return address;
      let alias = aliases.get(address);
      if (!alias) aliases.set(address, (alias = `anon:${randomBytes(6).toString("hex")}`));
      return alias;
    };

    return {
      key: clearingsKey(clearings),
      clearings: clearings.map((c) => ({ id: c.id.toString(), amount: c.amount.toString() })),
      parties: parties.map((party): PartyView =>
        known.has(party.address)
          ? {
              address: party.address,
              known: true,
              owesLess: party.owesLess.toString(),
              owedLess: party.owedLess.toString(),
              net: party.net.toString(),
              signed: hasSigned(party.address),
            }
          : { address: shown(party.address), known: false, owesLess: "0", owedLess: "0", net: "0", signed: hasSigned(party.address) },
      ),
      edges: [...edges.values()].map((edge) => ({
        from: shown(edge.from),
        to: shown(edge.to),
        amount: edge.from === this.me || edge.to === this.me ? edge.amount.toString() : null,
      })),
      cleared: clearings.reduce((sum, c) => sum + c.amount, 0n).toString(),
      moved: parties.reduce((sum, party) => (party.net > 0n ? sum + party.net : sum), 0n).toString(),
    };
  }

  /** The viewer and everyone it has a debt or a circle with. */
  counterparties(rows: ObligationRow[]): string[] {
    const addresses = new Set([this.me, ...this.neighbours]);
    for (const row of rows) addresses.add(row.debtor === this.me ? row.creditor : row.debtor);
    return [...addresses];
  }
}

async function namesOf(db: Db, addresses: string[]): Promise<BusinessView[]> {
  if (addresses.length === 0) return [];
  const rows = await db.select().from(businesses).where(inArray(businesses.address, addresses)).orderBy(businesses.name);
  return rows.map(({ address, name }) => ({ address, name }));
}

/** What the whole network has done, without saying who. */
async function networkStats(db: Db): Promise<NetworkStats> {
  const [[people], [settled]] = await Promise.all([
    // The made-up businesses of the example worlds are not counted among those of the network.
    db
      .select({ businesses: count() })
      .from(businesses)
      .where(notInArray(businesses.address, db.select({ address: exampleActors.address }).from(exampleActors))),
    db
      .select({
        settlements: count(),
        cleared: sql<string>`coalesce(sum((${events.data}->>'cleared')::numeric), 0)::text`,
        moved: sql<string>`coalesce(sum((${events.data}->>'moved')::numeric), 0)::text`,
      })
      .from(events)
      .where(and(eq(events.contractId, NODUS_CONTRACT), eq(events.type, "settled"))),
  ]);
  return {
    businesses: people?.businesses ?? 0,
    settlements: settled?.settlements ?? 0,
    cleared: settled?.cleared ?? "0",
    moved: settled?.moved ?? "0",
  };
}

/**
 * The settlements `me` took part in, newest first, `limit` at a time from
 * `offset`, each with the transaction that proves it.
 */
export async function mySettlements(
  db: Db,
  me: string,
  offset: number,
  limit: number,
  viewer?: Viewer,
): Promise<{ settlements: SettlementView[]; total: number }> {
  const here = eq(obligations.contractId, NODUS_CONTRACT);
  const myIds = (
    await db
      .select({ id: obligations.id })
      .from(obligations)
      .where(and(here, or(eq(obligations.debtor, me), eq(obligations.creditor, me))))
  ).map((row) => row.id);
  if (myIds.length === 0) return { settlements: [], total: 0 };

  // A settlement is mine when it cleared one of my debts.
  const hashes = (
    await db
      .selectDistinct({ txHash: events.txHash })
      .from(events)
      .where(and(eq(events.contractId, NODUS_CONTRACT), eq(events.type, "cleared"), inArray(events.obligationId, myIds)))
  ).map((row) => row.txHash);
  if (hashes.length === 0) return { settlements: [], total: 0 };

  const settledRows = await db
    .select()
    .from(events)
    .where(and(eq(events.contractId, NODUS_CONTRACT), eq(events.type, "settled"), inArray(events.txHash, hashes)))
    .orderBy(desc(events.id))
    .offset(offset)
    .limit(limit);
  const page = settledRows.map((event) => event.txHash);
  const clearedRows = page.length
    ? await db
        .select()
        .from(events)
        .where(and(eq(events.contractId, NODUS_CONTRACT), eq(events.type, "cleared"), inArray(events.txHash, page)))
        .orderBy(events.id)
    : [];
  const ids = clearedRows.flatMap((row) => (row.obligationId === null ? [] : [row.obligationId]));
  const debts = await debtsById(db, ids, []);
  const seen = viewer ?? new Viewer(me, debts);
  for (const [id, debt] of debts) if (!seen.debts.has(id)) seen.debts.set(id, debt);

  const settlements = settledRows.map((event): SettlementView => {
    // What a settlement cancelled is in the `cleared` events of its transaction.
    const clearings = clearedRows
      .filter((cleared) => cleared.txHash === event.txHash && cleared.obligationId !== null)
      .map((cleared) => ({ id: cleared.obligationId!, amount: BigInt(cleared.data.amount!) }));
    return {
      txHash: event.txHash,
      closedAt: event.closedAt.toISOString(),
      circle: {
        ...seen.option(clearings, () => true),
        proposal: { id: event.txHash, status: "settled" as const, expirationLedger: event.ledger, txHash: event.txHash },
      },
    };
  });
  return { settlements, total: hashes.length };
}

/** Orders the parties of a circle the way its debts chain: each one owes the next. */
function alongTheCircle<Party extends { address: string }>(parties: Party[], edges: Array<{ from: string; to: string }>): Party[] {
  const next = new Map(edges.map((edge) => [edge.from, edge.to]));
  const order: string[] = [];
  for (let at: string | undefined = parties[0]?.address; at && !order.includes(at); at = next.get(at)) order.push(at);
  if (order.length !== parties.length) return parties;
  return order.map((address) => parties.find((party) => party.address === address)!);
}
