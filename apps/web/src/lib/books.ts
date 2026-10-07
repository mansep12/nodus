/** Reads, out of the state of Nodus, what each screen says about one business. */
import type { CircleView, ObligationView, StateView } from "./types";

/** Which side of the books: what the business is owed, or what it owes. */
export type Side = "credit" | "debt";

/** Everything between the business and one other business, on one side of the books. */
export interface Relation {
  address: string;
  name: string;
  /** Accepted debt still owed. */
  standing: bigint;
  /** Registered but not accepted yet. */
  pending: bigint;
  /** How many debts make it up. */
  debts: number;
  /** Whether part of it can be cancelled in a circle found by Nodus. */
  inCircle: boolean;
}

export interface Books {
  /** Every debt on this side, whatever became of it. */
  obligations: ObligationView[];
  /** The other businesses with a debt still open on this side. */
  relations: Relation[];
  standing: bigint;
  pending: bigint;
}

export const isOpen = (obligation: ObligationView) => obligation.status === "pending" || obligation.status === "accepted";

/** Whether a circle is still to be settled. */
export const isLive = (circle: CircleView) => circle.proposal?.status !== "settled";

export const partyOf = (circle: CircleView, address: string) => circle.parties.find((party) => party.address === address);

/** One side of the books of `me`. */
export function readBooks(state: StateView, me: string, side: Side, nameOf: (address: string) => string): Books {
  const obligations = state.obligations.filter((obligation) => (side === "credit" ? obligation.creditor : obligation.debtor) === me);
  const netted = new Set(
    state.circles
      .filter((circle) => isLive(circle) && partyOf(circle, me))
      .flatMap((circle) => circle.clearings.map((clearing) => clearing.id)),
  );

  const relations = new Map<string, Relation>();
  for (const obligation of obligations.filter(isOpen)) {
    const address = side === "credit" ? obligation.debtor : obligation.creditor;
    let relation = relations.get(address);
    if (!relation)
      relations.set(address, (relation = { address, name: nameOf(address), standing: 0n, pending: 0n, debts: 0, inCircle: false }));
    if (obligation.status === "accepted") relation.standing += BigInt(obligation.amount);
    else relation.pending += BigInt(obligation.amount);
    relation.debts += 1;
    relation.inCircle ||= netted.has(obligation.id);
  }

  const all = [...relations.values()];
  return {
    obligations,
    relations: all,
    standing: all.reduce((sum, relation) => sum + relation.standing, 0n),
    pending: all.reduce((sum, relation) => sum + relation.pending, 0n),
  };
}

/** What is waiting, and on whom, among the things that concern `me`. */
export function readInbox(state: StateView, me: string) {
  const mine = state.circles.filter((circle) => partyOf(circle, me));
  const signing = (circle: CircleView) => circle.proposal?.status === "open";
  return {
    /** Circles the others are signing and `me` has not. */
    toSign: mine.filter((circle) => signing(circle) && !partyOf(circle, me)!.signed),
    /** Circles Nodus found that nobody has started signing. */
    found: mine.filter((circle) => circle.proposal === undefined || circle.proposal.status === "failed"),
    /** Circles `me` signed that wait for the rest, or are being sent. */
    waiting: mine.filter((circle) => (signing(circle) && partyOf(circle, me)!.signed) || circle.proposal?.status === "submitted"),
    /** Circles settled a moment ago. */
    settled: mine.filter((circle) => circle.proposal?.status === "settled"),
    /** Debts registered against `me` that it has not accepted. */
    toAccept: state.obligations.filter((obligation) => obligation.debtor === me && obligation.status === "pending"),
    /** Debts `me` registered that the other business has not accepted. */
    awaited: state.obligations.filter((obligation) => obligation.creditor === me && obligation.status === "pending"),
  };
}

/** How many things need `me` to do something. */
export function countPending(state: StateView, me: string): { toSign: number; toAccept: number } {
  const inbox = readInbox(state, me);
  return { toSign: inbox.toSign.length + inbox.found.length, toAccept: inbox.toAccept.length };
}
