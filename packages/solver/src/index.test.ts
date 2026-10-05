import { describe, expect, test } from "bun:test";
import { effects, propose, withoutMoney, type Obligation } from "./index.ts";

let nextId = 0n;
const owes = (debtor: string, creditor: string, amount: bigint): Obligation => ({
  id: nextId++,
  debtor,
  creditor,
  amount,
});

describe("propose", () => {
  test("settles a circle in full, moving only the nets", () => {
    const ab = owes("A", "B", 100n);
    const bc = owes("B", "C", 80n);
    const ca = owes("C", "A", 90n);

    const [proposal, ...rest] = propose([ab, bc, ca]);

    expect(rest).toEqual([]);
    expect(proposal).toEqual({
      clearings: [
        { id: ab.id, amount: 100n },
        { id: bc.id, amount: 80n },
        { id: ca.id, amount: 90n },
      ],
      parties: [
        { address: "A", owesLess: 100n, owedLess: 90n, net: -10n },
        { address: "B", owesLess: 80n, owedLess: 100n, net: 20n },
        { address: "C", owesLess: 90n, owedLess: 80n, net: -10n },
      ],
      cleared: 270n,
      moved: 20n,
    });
  });

  test("in net mode cancels only the common amount and moves nothing", () => {
    const ab = owes("A", "B", 100n);
    const bc = owes("B", "C", 80n);
    const ca = owes("C", "A", 90n);

    const [proposal, ...rest] = propose([ab, bc, ca], { mode: "net" });

    expect(rest).toEqual([]);
    expect(proposal!.clearings.map((c) => c.amount)).toEqual([80n, 80n, 80n]);
    expect(proposal!.cleared).toBe(240n);
    expect(proposal!.moved).toBe(0n);
    expect(proposal!.parties.every((p) => p.net === 0n)).toBe(true);
  });

  test("finds nothing when debts do not close a circle", () => {
    expect(propose([owes("A", "B", 100n), owes("B", "C", 100n), owes("A", "C", 100n)])).toEqual([]);
    expect(propose([])).toEqual([]);
  });

  test("nets two parties that owe each other", () => {
    const [proposal] = propose([owes("A", "B", 100n), owes("B", "A", 60n)]);

    expect(proposal!.cleared).toBe(160n);
    expect(proposal!.moved).toBe(40n);
    expect(proposal!.parties).toEqual([
      { address: "A", owesLess: 100n, owedLess: 60n, net: -40n },
      { address: "B", owesLess: 60n, owedLess: 100n, net: 40n },
    ]);
  });

  test("treats several debts between the same two parties as one link", () => {
    const first = owes("A", "B", 30n);
    const bc = owes("B", "C", 50n);
    const ca = owes("C", "A", 50n);
    const second = owes("A", "B", 40n);

    const [full] = propose([first, bc, ca, second]);
    expect(full!.clearings).toEqual([
      { id: first.id, amount: 30n },
      { id: bc.id, amount: 50n },
      { id: ca.id, amount: 50n },
      { id: second.id, amount: 40n },
    ]);

    // The common amount (50) is taken from the oldest debts first: 30 + 20.
    const [net] = propose([first, bc, ca, second], { mode: "net" });
    expect(net!.clearings).toEqual([
      { id: first.id, amount: 30n },
      { id: bc.id, amount: 50n },
      { id: ca.id, amount: 50n },
      { id: second.id, amount: 20n },
    ]);
  });

  test("proposes independent circles, the one that frees the most first", () => {
    const small = [owes("A", "B", 10n), owes("B", "A", 10n)];
    const big = [owes("X", "Y", 500n), owes("Y", "Z", 500n), owes("Z", "X", 500n)];

    const proposals = propose([...small, ...big]);

    expect(proposals.map((p) => p.cleared)).toEqual([1500n, 20n]);
  });

  test("uses a debt shared by two circles only once", () => {
    // A→B is part of both A→B→C→A and A→B→D→A.
    const ab = owes("A", "B", 100n);
    const viaC = [owes("B", "C", 100n), owes("C", "A", 100n)];
    const viaD = [owes("B", "D", 40n), owes("D", "A", 40n)];

    const proposals = propose([ab, ...viaC, ...viaD]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.cleared).toBe(300n);
  });

  test("in net mode keeps netting what is left of a shared debt", () => {
    const ab = owes("A", "B", 100n);
    const viaC = [owes("B", "C", 60n), owes("C", "A", 60n)];
    const viaD = [owes("B", "D", 40n), owes("D", "A", 40n)];

    const proposals = propose([ab, ...viaC, ...viaD], { mode: "net" });

    expect(proposals.map((p) => p.cleared)).toEqual([180n, 120n]);
    const clearedOfShared = proposals.flatMap((p) => p.clearings).filter((c) => c.id === ab.id);
    expect(clearedOfShared.map((c) => c.amount)).toEqual([60n, 40n]);
  });

  test("respects the maximum number of parties", () => {
    const ring = [owes("A", "B", 10n), owes("B", "C", 10n), owes("C", "D", 10n), owes("D", "A", 10n)];

    expect(propose(ring, { maxParties: 3 })).toEqual([]);
    expect(propose(ring, { maxParties: 4 })).toHaveLength(1);
  });

  test("prefers the shorter circle when two free the same amount", () => {
    const short = [owes("A", "B", 30n), owes("B", "A", 30n)];
    const long = [owes("X", "Y", 20n), owes("Y", "Z", 20n), owes("Z", "X", 20n)];

    const [first] = propose([...long, ...short]);

    expect(first!.parties.map((p) => p.address)).toEqual(["A", "B"]);
  });

  test("returns clearings sorted by obligation id whatever the direction of the circle", () => {
    const ca = owes("C", "A", 50n);
    const bc = owes("B", "C", 50n);
    const ab = owes("A", "B", 50n);

    const [proposal] = propose([ab, bc, ca]);

    expect(proposal!.clearings.map((c) => c.id)).toEqual([ca.id, bc.id, ab.id]);
    expect(proposal!.parties.map((p) => p.address)).toEqual(["A", "B", "C"]);
  });

  test("ignores empty obligations and does not modify its input", () => {
    const obligations = [owes("A", "B", 0n), owes("B", "A", 10n), owes("A", "B", 10n)];
    const snapshot = structuredClone(obligations);

    expect(propose(obligations)).toHaveLength(1);
    expect(obligations).toEqual(snapshot);
  });
});

describe("withoutMoney", () => {
  test("turns a full settlement into the one that moves nothing", () => {
    const obligations = [owes("A", "B", 100n), owes("B", "C", 80n), owes("C", "A", 90n)];
    const [full] = propose(obligations);

    const netOnly = withoutMoney(full!, obligations);

    expect(netOnly).toEqual(propose(obligations, { mode: "net" })[0]!);
    expect(netOnly.moved).toBe(0n);
    expect(netOnly.cleared).toBe(240n);
    expect(netOnly.parties.map((p) => p.address)).toEqual(full!.parties.map((p) => p.address));
  });

  test("takes the common amount from the oldest debts of each link", () => {
    const first = owes("A", "B", 30n);
    const back = owes("B", "A", 50n);
    const second = owes("A", "B", 40n);
    const obligations = [first, back, second];

    const netOnly = withoutMoney(propose(obligations)[0]!, obligations);

    expect(netOnly.clearings).toEqual([
      { id: first.id, amount: 30n },
      { id: back.id, amount: 50n },
      { id: second.id, amount: 20n },
    ]);
  });

  test("changes nothing when the circle already moves no money", () => {
    const obligations = [owes("A", "B", 70n), owes("B", "C", 70n), owes("C", "A", 70n)];
    const [full] = propose(obligations);

    expect(withoutMoney(full!, obligations)).toEqual(full!);
  });

  test("only counts what the proposal clears, not all that is owed", () => {
    const ab = owes("A", "B", 100n);
    const ba = owes("B", "A", 100n);
    // A proposal that clears part of each debt.
    const partial = { ...propose([ab, ba])[0]!, clearings: [{ id: ab.id, amount: 60n }, { id: ba.id, amount: 20n }] };

    const netOnly = withoutMoney(partial, [ab, ba]);

    expect(netOnly.clearings.map((c) => c.amount)).toEqual([20n, 20n]);
  });
});

describe("effects", () => {
  test("nets always add up to zero", () => {
    const obligations = [owes("A", "B", 100n), owes("B", "C", 80n), owes("C", "A", 90n)];
    const clearings = obligations.map((o) => ({ id: o.id, amount: o.amount / 2n }));

    const parties = effects(clearings, obligations);

    expect(parties.reduce((sum, p) => sum + p.net, 0n)).toBe(0n);
  });

  test("rejects clearings of unknown obligations", () => {
    expect(() => effects([{ id: 999n, amount: 1n }], [])).toThrow("Unknown obligation 999");
  });
});

describe("propose, against a plain search", () => {
  /**
   * The obvious way to do it: look at every circle, take the best, remove its
   * debts and start over. `propose` must agree with it while searching once.
   */
  function plainSearch(obligations: Obligation[], maxParties: number) {
    let left = obligations.map((obligation) => ({ ...obligation }));
    const taken: Array<{ ids: bigint[]; cleared: bigint; moved: bigint }> = [];
    for (;;) {
      const parties = [...new Set(left.flatMap((o) => [o.debtor, o.creditor]))].sort();
      const between = (debtor: string, creditor: string) => left.filter((o) => o.debtor === debtor && o.creditor === creditor);
      let best: { ids: bigint[]; cleared: bigint; moved: bigint; length: number } | undefined;

      const walk = (path: string[]) => {
        for (const next of parties) {
          if (between(path.at(-1)!, next).length === 0) continue;
          if (next === path[0] && path.length >= 2) {
            const links = path.map((debtor, i) => between(debtor, path[(i + 1) % path.length]!));
            const clearings = links.flat().map(({ id, amount }) => ({ id, amount }));
            const cleared = clearings.reduce((sum, c) => sum + c.amount, 0n);
            const moved = effects(clearings, left).reduce((sum, p) => (p.net > 0n ? sum + p.net : sum), 0n);
            const better =
              !best ||
              cleared - moved > best.cleared - best.moved ||
              (cleared - moved === best.cleared - best.moved && path.length < best.length);
            if (better) best = { ids: clearings.map((c) => c.id).sort((a, b) => Number(a - b)), cleared, moved, length: path.length };
          } else if (next > path[0]! && !path.includes(next) && path.length < maxParties) {
            walk([...path, next]);
          }
        }
      };
      for (const start of parties) walk([start]);

      if (!best) return taken;
      taken.push({ ids: best.ids, cleared: best.cleared, moved: best.moved });
      left = left.filter((o) => !best!.ids.includes(o.id));
    }
  }

  /** A repeatable pseudo-random network of debts. */
  function network(parties: number, debts: number, seed: number): Obligation[] {
    let state = seed;
    const next = (below: number) => ((state = (state * 1103515245 + 12345) % 2147483648), state % below);
    const obligations: Obligation[] = [];
    while (obligations.length < debts) {
      const [debtor, creditor] = [next(parties), next(parties)];
      if (debtor !== creditor) {
        obligations.push({ id: BigInt(obligations.length), debtor: `P${debtor}`, creditor: `P${creditor}`, amount: BigInt(1 + next(500)) });
      }
    }
    return obligations;
  }

  test.each([
    [5, 12, 1],
    [6, 16, 2],
    [7, 18, 3],
    [8, 20, 4],
    [8, 24, 5],
  ])("%d parties with %d debts (seed %d)", (parties, debts, seed) => {
    const obligations = network(parties, debts, seed);

    const proposals = propose(obligations, { maxParties: 5 });

    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.map((p) => ({ ids: p.clearings.map((c) => c.id), cleared: p.cleared, moved: p.moved }))).toEqual(
      plainSearch(obligations, 5),
    );
  });
});
