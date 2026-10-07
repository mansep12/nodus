import { describe, expect, test } from "bun:test";
import { findCandidates } from "./circles";

const accepted = [
  { id: 0n, debtor: "A", creditor: "B", amount: 100n },
  { id: 1n, debtor: "B", creditor: "C", amount: 80n },
  { id: 2n, debtor: "C", creditor: "A", amount: 90n },
  // Not part of any circle.
  { id: 3n, debtor: "D", creditor: "A", amount: 50n },
];

describe("findCandidates", () => {
  test("offers a circle in full and, when that moves money, without moving any", () => {
    const [candidate, ...others] = findCandidates(accepted, []).candidates;

    expect(others).toEqual([]);
    expect(candidate!.full).toMatchObject({ cleared: 270n, moved: 20n });
    expect(candidate!.netOnly).toMatchObject({ cleared: 240n, moved: 0n });
  });

  test("offers only one way when settling in full already moves no money", () => {
    const even = accepted.slice(0, 3).map((obligation) => ({ ...obligation, amount: 70n }));

    expect(findCandidates(even, []).candidates).toEqual([{ full: expect.objectContaining({ cleared: 210n, moved: 0n }) }]);
  });

  test("sets aside what a proposal under way is going to cancel", () => {
    // The whole circle is being signed already.
    const inFull = accepted.slice(0, 3).map(({ id, amount }) => ({ id, amount }));
    expect(findCandidates(accepted, [inFull]).candidates).toEqual([]);

    // Only its common part is: what is left no longer closes a circle.
    const commonPart = accepted.slice(0, 3).map(({ id }) => ({ id, amount: 80n }));
    expect(findCandidates(accepted, [commonPart]).candidates).toEqual([]);

    // Part of each debt is: the circle is still there, smaller.
    const half = accepted.slice(0, 3).map(({ id }) => ({ id, amount: 40n }));
    expect(findCandidates(accepted, [half]).candidates[0]!.full).toMatchObject({ cleared: 150n, moved: 20n });
  });

  test("says when it stopped before looking at every circle", () => {
    // No time at all: the search gives up after the first batch of circles.
    const ring = Array.from({ length: 12 }, (_, i) => ({ id: BigInt(i), debtor: `P${i}`, creditor: `P${(i + 1) % 12}`, amount: 10n }));
    const dense = ring.flatMap((o, i) => [o, { id: BigInt(100 + i), debtor: o.creditor, creditor: o.debtor, amount: 5n }]);

    expect(findCandidates(dense, [], Infinity).cutShort).toBe(false);
    expect(findCandidates(accepted, [], 0).cutShort).toBe(false);
  });
});
