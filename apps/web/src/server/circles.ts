import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { proposals, type Db } from "@nodus/db";
import { settleable } from "@nodus/indexer";
import { propose, withoutMoney, type Clearing, type Obligation, type Proposal } from "@nodus/solver";
import { NODUS_CONTRACT } from "@/lib/config";

/** Every party has to sign, so circles longer than this are not proposed. */
const MAX_PARTIES = 8;

/** A circle that can be settled now, in the ways it can be settled. */
export interface Candidate {
  /** Cancels every debt in the circle; each party pays or receives its net. */
  full: Proposal;
  /** Cancels only what the circle has in common, moving no money. Absent when `full` already moves none. */
  netOnly?: Proposal;
}

export const parseClearings = (clearings: Array<{ id: string; amount: string }>): Clearing[] =>
  clearings.map((clearing) => ({ id: BigInt(clearing.id), amount: BigInt(clearing.amount) }));

/**
 * The circles among the `accepted` debts, after setting aside what the
 * proposals under way are already going to cancel.
 */
export function findCandidates(accepted: Obligation[], underWay: Clearing[][]): Candidate[] {
  const committed = new Map<bigint, bigint>();
  for (const { id, amount } of underWay.flat()) committed.set(id, (committed.get(id) ?? 0n) + amount);
  const free = accepted.map((obligation) => ({
    ...obligation,
    amount: obligation.amount - (committed.get(obligation.id) ?? 0n),
  }));
  return propose(free, { maxParties: MAX_PARTIES }).map((full) =>
    full.moved === 0n ? { full } : { full, netOnly: withoutMoney(full, free) },
  );
}

/** The circles that can be proposed right now. */
export async function currentCandidates(db: Db): Promise<Candidate[]> {
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
