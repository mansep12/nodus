import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { candidates, proposals, type Db } from "@nodus/db";
import { settleable } from "@nodus/indexer";
import { search, withoutMoney, type Clearing, type Obligation, type Proposal } from "@nodus/solver";
import { NODUS_CONTRACT } from "@/lib/config";

/** Every party has to sign, so circles longer than this are not proposed. */
const MAX_PARTIES = 8;
/** How long one search may take before proposing what it has found so far. */
const BUDGET_MS = 2_000;

/** A circle that can be settled now, in the ways it can be settled. */
export interface Candidate {
  /** Cancels every debt in the circle; each party pays or receives its net. */
  full: Proposal;
  /** Cancels only what the circle has in common, moving no money. Absent when `full` already moves none. */
  netOnly?: Proposal;
}

export interface Candidates {
  candidates: Candidate[];
  /** Whether the search stopped before looking at every circle. */
  cutShort: boolean;
  computedAt: Date;
}

export const parseClearings = (clearings: Array<{ id: string; amount: string }>): Clearing[] =>
  clearings.map((clearing) => ({ id: BigInt(clearing.id), amount: BigInt(clearing.amount) }));

/**
 * The circles among the `accepted` debts, after setting aside what the
 * proposals under way are already going to cancel.
 */
export function findCandidates(accepted: Obligation[], underWay: Clearing[][], budgetMs = BUDGET_MS): Omit<Candidates, "computedAt"> {
  const committed = new Map<bigint, bigint>();
  for (const { id, amount } of underWay.flat()) committed.set(id, (committed.get(id) ?? 0n) + amount);
  const free = accepted.map((obligation) => ({
    ...obligation,
    amount: obligation.amount - (committed.get(obligation.id) ?? 0n),
  }));
  const found = search(free, { maxParties: MAX_PARTIES, budgetMs });
  return {
    candidates: found.proposals.map((full) => (full.moved === 0n ? { full } : { full, netOnly: withoutMoney(full, free) })),
    cutShort: found.cutShort,
  };
}

/** The circles that can be proposed right now, from the database. */
export async function currentCandidates(db: Db): Promise<Omit<Candidates, "computedAt">> {
  const [accepted, underWay] = await Promise.all([
    settleable(db, NODUS_CONTRACT),
    db
      .select({ clearings: proposals.clearings })
      .from(proposals)
      .where(and(eq(proposals.contractId, NODUS_CONTRACT), inArray(proposals.status, ["open", "submitted"]))),
  ]);
  return findCandidates(
    accepted,
    underWay.map((proposal) => parseClearings(proposal.clearings)),
  );
}

// The cache keeps amounts and ids as decimal strings.
type Stored = { full: StoredProposal; netOnly?: StoredProposal };
type StoredProposal = {
  clearings: Array<{ id: string; amount: string }>;
  parties: Array<{ address: string; owesLess: string; owedLess: string; net: string }>;
  cleared: string;
  moved: string;
};

const store = (proposal: Proposal): StoredProposal => ({
  clearings: proposal.clearings.map((c) => ({ id: c.id.toString(), amount: c.amount.toString() })),
  parties: proposal.parties.map((p) => ({
    address: p.address,
    owesLess: p.owesLess.toString(),
    owedLess: p.owedLess.toString(),
    net: p.net.toString(),
  })),
  cleared: proposal.cleared.toString(),
  moved: proposal.moved.toString(),
});

const restore = (stored: StoredProposal): Proposal => ({
  clearings: parseClearings(stored.clearings),
  parties: stored.parties.map((p) => ({
    address: p.address,
    owesLess: BigInt(p.owesLess),
    owedLess: BigInt(p.owedLess),
    net: BigInt(p.net),
  })),
  cleared: BigInt(stored.cleared),
  moved: BigInt(stored.moved),
});

/**
 * Runs the search and keeps its result, so that reads do not have to. Called
 * whenever the debts or the proposals under way change.
 */
export async function recomputeCandidates(db: Db): Promise<Candidates> {
  const found = await currentCandidates(db);
  const data: Stored[] = found.candidates.map((c) => ({ full: store(c.full), ...(c.netOnly ? { netOnly: store(c.netOnly) } : {}) }));
  const computedAt = new Date();
  await db
    .insert(candidates)
    .values({ contractId: NODUS_CONTRACT, data, cutShort: found.cutShort, computedAt })
    .onConflictDoUpdate({ target: candidates.contractId, set: { data, cutShort: found.cutShort, computedAt } });
  return { ...found, computedAt };
}

/** The circles found last, computing them if there is no result yet. */
export async function cachedCandidates(db: Db): Promise<Candidates> {
  const [row] = await db.select().from(candidates).where(eq(candidates.contractId, NODUS_CONTRACT));
  if (!row) return recomputeCandidates(db);
  const data = row.data as Stored[];
  return {
    candidates: data.map((c) => ({ full: restore(c.full), ...(c.netOnly ? { netOnly: restore(c.netOnly) } : {}) })),
    cutShort: row.cutShort,
    computedAt: row.computedAt,
  };
}
