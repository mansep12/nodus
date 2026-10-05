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
    const [candidate, ...others] = findCandidates(accepted, []);

    expect(others).toEqual([]);
    expect(candidate!.full).toMatchObject({ cleared: 270n, moved: 20n });
    expect(candidate!.netOnly).toMatchObject({ cleared: 240n, moved: 0n });
  });

  test("offers only one way when settling in full already moves no money", () => {
    const even = accepted.slice(0, 3).map((obligation) => ({ ...obligation, amount: 70n }));

    expect(findCandidates(even, [])).toEqual([{ full: expect.objectContaining({ cleared: 210n, moved: 0n }) }]);
  });

  test("sets aside what a proposal under way is going to cancel", () => {
    // The whole circle is being signed already.
    const inFull = accepted.slice(0, 3).map(({ id, amount }) => ({ id, amount }));
    expect(findCandidates(accepted, [inFull])).toEqual([]);

    // Only its common part is: what is left no longer closes a circle.
    const commonPart = accepted.slice(0, 3).map(({ id }) => ({ id, amount: 80n }));
    expect(findCandidates(accepted, [commonPart])).toEqual([]);

    // Part of each debt is: the circle is still there, smaller.
    const half = accepted.slice(0, 3).map(({ id }) => ({ id, amount: 40n }));
    expect(findCandidates(accepted, [half])[0]!.full).toMatchObject({ cleared: 150n, moved: 20n });
  });
});
