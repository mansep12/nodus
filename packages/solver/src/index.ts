/**
 * Finds circles of debt and turns them into settlements the contract accepts.
 *
 * The solver is not trusted: the contract validates every clearing and each
 * party signs only after seeing its own effect, so a wrong proposal can at
 * worst be rejected.
 */

/** A debt of `amount` that `debtor` owes to `creditor`, as recorded on chain. */
export interface Obligation {
  id: bigint;
  debtor: string;
  creditor: string;
  amount: bigint;
}

/** How much of obligation `id` a settlement cancels (the contract's `Clearing`). */
export interface Clearing {
  id: bigint;
  amount: bigint;
}

/** What a settlement means for one party. */
export interface PartyEffect {
  address: string;
  /** Debt it stops owing. */
  owesLess: bigint;
  /** Credit it stops being owed. */
  owedLess: bigint;
  /** `owedLess - owesLess`: it receives this when positive and pays it when negative. */
  net: bigint;
}

export interface Proposal {
  /** Sorted by obligation id, as the contract requires. */
  clearings: Clearing[];
  /** In the order the debts chain around the circle. */
  parties: PartyEffect[];
  /** Total debt cancelled. */
  cleared: bigint;
  /** Total money that changes hands. */
  moved: bigint;
}

/**
 * - `full`: cancel every obligation in the circle; each party pays or receives its net.
 * - `net`: cancel only the amount common to the whole circle; no money moves.
 */
export type Mode = "full" | "net";

export interface Options {
  /** Largest circle to look for. Every party must sign, so short circles close more easily. */
  maxParties?: number;
  mode?: Mode;
}

/** The effect of `clearings` on each party involved, in order of first appearance. */
export function effects(clearings: Clearing[], obligations: Iterable<Obligation>): PartyEffect[] {
  const byId = new Map<bigint, Obligation>();
  for (const obligation of obligations) byId.set(obligation.id, obligation);

  const parties = new Map<string, PartyEffect>();
  const party = (address: string) => {
    let effect = parties.get(address);
    if (!effect) parties.set(address, (effect = { address, owesLess: 0n, owedLess: 0n, net: 0n }));
    return effect;
  };
  for (const { id, amount } of clearings) {
    const obligation = byId.get(id);
    if (!obligation) throw new Error(`Unknown obligation ${id}`);
    const debtor = party(obligation.debtor);
    const creditor = party(obligation.creditor);
    debtor.owesLess += amount;
    debtor.net -= amount;
    creditor.owedLess += amount;
    creditor.net += amount;
  }
  return [...parties.values()];
}

/**
 * Proposes settlements for the given obligations, best first: the circle that
 * frees the most liquidity, with fewer parties on a tie. Each proposal is
 * computed on what the previous ones leave outstanding, so they can all be
 * executed, in any order.
 *
 * Only pass obligations that can be settled: accepted by the debtor.
 */
export function propose(obligations: Obligation[], options: Options = {}): Proposal[] {
  const { maxParties = 6, mode = "full" } = options;
  let outstanding = obligations
    .filter((o) => o.amount > 0n && o.debtor !== o.creditor)
    .map((o) => ({ ...o }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const proposals: Proposal[] = [];

  if (mode === "full") {
    // A circle settled in full uses its debts up, so one search is enough:
    // take the circles from best to worst, skipping any that shares a debt
    // with one already taken.
    const taken = new Set<bigint>();
    for (const links of ranked(outstanding, maxParties, mode)) {
      if (links.some((link) => link.some((obligation) => taken.has(obligation.id)))) continue;
      for (const obligation of links.flat()) taken.add(obligation.id);
      proposals.push(clear(links, mode, outstanding));
    }
    return proposals;
  }

  // Cancelling only the common amount leaves the rest of each debt free to
  // be netted in another circle, so the search starts over after each one.
  for (;;) {
    const [best] = ranked(outstanding, maxParties, mode);
    if (!best) return proposals;
    const proposal = clear(best, mode, outstanding);
    proposals.push(proposal);

    const clearedBy = new Map(proposal.clearings.map((c) => [c.id, c.amount]));
    for (const obligation of outstanding) obligation.amount -= clearedBy.get(obligation.id) ?? 0n;
    outstanding = outstanding.filter((o) => o.amount > 0n);
  }
}

/** A circle as its chain of links: the debts each party has with the next. */
type Links = Obligation[][];

/** A dense network has more circles than is worth looking at; the search stops here. */
const MAX_CIRCLES = 50_000;

/**
 * The circles among `obligations`, from the one that frees the most liquidity
 * to the one that frees the least, with fewer parties first on a tie.
 */
function ranked(obligations: Obligation[], maxParties: number, mode: Mode): Links[] {
  // All the obligations from one party to another act as a single edge.
  const edges = new Map<string, Map<string, Obligation[]>>();
  for (const obligation of obligations) {
    let from = edges.get(obligation.debtor);
    if (!from) edges.set(obligation.debtor, (from = new Map()));
    const edge = from.get(obligation.creditor);
    if (edge) edge.push(obligation);
    else from.set(obligation.creditor, [obligation]);
  }

  const found: Array<{ links: Links; freed: bigint }> = [];
  for (const circle of circles(edges, maxParties)) {
    const links = circle.map((debtor, i) => edges.get(debtor)!.get(circle[(i + 1) % circle.length]!)!);
    found.push({ links, freed: freedBy(links.map(total), mode) });
    if (found.length === MAX_CIRCLES) break;
  }
  return found
    .sort((a, b) => (a.freed > b.freed ? -1 : a.freed < b.freed ? 1 : a.links.length - b.links.length))
    .map((circle) => circle.links);
}

const total = (link: Obligation[]) => link.reduce((sum, obligation) => sum + obligation.amount, 0n);

/** The debt a circle cancels beyond the money it moves, given what each party owes the next. */
function freedBy(owed: bigint[], mode: Mode): bigint {
  if (mode === "net") return owed.reduce((min, amount) => (amount < min ? amount : min)) * BigInt(owed.length);
  // In full everything is cancelled, and each party receives what it is owed
  // beyond what it owes.
  let freed = 0n;
  owed.forEach((owes, i) => {
    const isOwed = owed[(i + owed.length - 1) % owed.length]!;
    freed += isOwed > owes ? owes - (isOwed - owes) : owes;
  });
  return freed;
}

/**
 * Every simple directed circle of up to `maxParties` parties, each one once.
 * A circle is found from its lowest address, visiting only higher ones.
 */
function* circles(edges: Map<string, Map<string, Obligation[]>>, maxParties: number): Generator<string[]> {
  const creditors = new Map([...edges].map(([debtor, to]) => [debtor, [...to.keys()].sort()]));
  for (const start of [...edges.keys()].sort()) {
    const path = [start];
    yield* extend(start, path, new Set(path));
  }

  function* extend(start: string, path: string[], onPath: Set<string>): Generator<string[]> {
    for (const next of creditors.get(path[path.length - 1]!) ?? []) {
      if (next === start) {
        if (path.length >= 2) yield [...path];
      } else if (next > start && !onPath.has(next) && path.length < maxParties) {
        path.push(next);
        onPath.add(next);
        yield* extend(start, path, onPath);
        path.pop();
        onPath.delete(next);
      }
    }
  }
}

/**
 * The proposal that clears a chain of links, each one the debts a party has
 * with the next. The amount of each obligation is what there is to clear.
 */
function clear(links: Links, mode: Mode, obligations: Obligation[]): Proposal {
  const common = links.map(total).reduce((min, amount) => (amount < min ? amount : min));

  const clearings: Clearing[] = [];
  for (const link of links) {
    // In `net` mode the common amount is taken from the oldest obligations first.
    let left = mode === "full" ? total(link) : common;
    for (const obligation of link) {
      if (left === 0n) break;
      const amount = obligation.amount < left ? obligation.amount : left;
      clearings.push({ id: obligation.id, amount });
      left -= amount;
    }
  }

  const parties = effects(clearings, obligations);
  return {
    clearings: clearings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    parties,
    cleared: clearings.reduce((sum, c) => sum + c.amount, 0n),
    moved: parties.reduce((sum, p) => (p.net > 0n ? sum + p.net : sum), 0n),
  };
}

/**
 * The same circle as `proposal`, settled without moving any money: it cancels
 * only what all its links have in common and leaves the rest owed. Useful
 * when a party cannot pay its net.
 */
export function withoutMoney(proposal: Proposal, obligations: Iterable<Obligation>): Proposal {
  const all = [...obligations];
  const byId = new Map(all.map((obligation) => [obligation.id, obligation]));

  const links = new Map<string, Obligation[]>();
  for (const { id, amount } of proposal.clearings) {
    const obligation = byId.get(id);
    if (!obligation) throw new Error(`Unknown obligation ${id}`);
    const key = `${obligation.debtor}>${obligation.creditor}`;
    const link = links.get(key);
    if (link) link.push({ ...obligation, amount });
    else links.set(key, [{ ...obligation, amount }]);
  }

  // Keep the parties in the order they chain, when the proposal is a circle.
  const { parties } = proposal;
  const chain = parties.map((party, i) => links.get(`${party.address}>${parties[(i + 1) % parties.length]!.address}`));
  const isCircle = chain.length === links.size && chain.every((link) => link !== undefined);
  return clear(isCircle ? (chain as Obligation[][]) : [...links.values()], "net", all);
}
