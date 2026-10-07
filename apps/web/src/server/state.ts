import "server-only";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { authorizations, businesses, events, obligations, proposals } from "@nodus/db";
import { effects, type Clearing, type Obligation } from "@nodus/solver";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "@/lib/config";
import type { CircleView, SettlementOption, StateView } from "@/lib/types";
import { latestLedger, tokenBalance } from "./chain";
import { findCandidates, parseClearings } from "./circles";
import { getDb, refresh } from "./db";
import { clearingsKey, closeStaleProposals } from "./proposals";

type Proposal = typeof proposals.$inferSelect;

/** How long a finished proposal stays on screen. */
const RECENT_MS = 15 * 60_000;

/** Everything the app shows, read from the database copy of the contract. */
export async function getState(address: string | null): Promise<StateView> {
  await refresh();
  const db = await getDb();
  await closeStaleProposals(db);

  const [ledger, businessRows, obligationRows, proposalRows, settledRows, balance] = await Promise.all([
    latestLedger(),
    db.select().from(businesses).orderBy(asc(businesses.name)),
    db.select().from(obligations).where(eq(obligations.contractId, NODUS_CONTRACT)).orderBy(asc(obligations.id)),
    db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.contractId, NODUS_CONTRACT),
          or(inArray(proposals.status, ["open", "submitted"]), gt(proposals.createdAt, new Date(Date.now() - RECENT_MS))),
        ),
      )
      .orderBy(desc(proposals.createdAt)),
    db
      .select()
      .from(events)
      .where(and(eq(events.contractId, NODUS_CONTRACT), eq(events.type, "settled")))
      .orderBy(desc(events.id))
      .limit(20),
    address ? tokenBalance(address).catch(() => null) : null,
  ]);

  const proposalIds = proposalRows.map((proposal) => proposal.id);
  const signatureRows = proposalIds.length
    ? await db.select().from(authorizations).where(inArray(authorizations.proposalId, proposalIds))
    : [];
  const hashes = settledRows.map((event) => event.txHash);
  const clearedRows = hashes.length
    ? await db
        .select()
        .from(events)
        .where(and(eq(events.type, "cleared"), inArray(events.txHash, hashes)))
        .orderBy(asc(events.id))
    : [];

  const all: Obligation[] = obligationRows.map(({ id, debtor, creditor, amount }) => ({ id, debtor, creditor, amount }));
  const byId = new Map(all.map((obligation) => [obligation.id, obligation]));

  /** What settling `clearings` means, and who of its parties `hasSigned`. */
  const option = (clearings: Clearing[], hasSigned: (address: string) => boolean): SettlementOption => {
    // One edge per pair of parties, however many debts link them.
    const edges = new Map<string, { from: string; to: string; amount: bigint }>();
    for (const { id, amount } of clearings) {
      const { debtor, creditor } = byId.get(id)!;
      const edge = edges.get(`${debtor}>${creditor}`);
      if (edge) edge.amount += amount;
      else edges.set(`${debtor}>${creditor}`, { from: debtor, to: creditor, amount });
    }
    const parties = alongTheCircle(effects(clearings, all), [...edges.values()]);
    return {
      key: clearingsKey(clearings),
      clearings: clearings.map((c) => ({ id: c.id.toString(), amount: c.amount.toString() })),
      parties: parties.map((party) => ({
        address: party.address,
        owesLess: party.owesLess.toString(),
        owedLess: party.owedLess.toString(),
        net: party.net.toString(),
        signed: hasSigned(party.address),
      })),
      edges: [...edges.values()].map((edge) => ({ ...edge, amount: edge.amount.toString() })),
      cleared: clearings.reduce((sum, c) => sum + c.amount, 0n).toString(),
      moved: parties.reduce((sum, party) => (party.net > 0n ? sum + party.net : sum), 0n).toString(),
    };
  };
  const nobody = () => false;
  const everybody = () => true;

  /** A circle someone has started signing. */
  const started = (proposal: Proposal): CircleView => {
    const signed = new Set(signatureRows.filter((row) => row.proposalId === proposal.id && row.signedEntry).map((row) => row.address));
    return {
      ...option(parseClearings(proposal.clearings), proposal.status === "settled" ? everybody : (a) => signed.has(a)),
      proposal: {
        id: proposal.id,
        status: proposal.status,
        expirationLedger: proposal.expirationLedger,
        txHash: proposal.txHash ?? undefined,
        error: proposal.error ?? undefined,
      },
    };
  };

  // Circles already gathering signatures keep their debts; new circles are
  // searched for in what is left.
  const underWay = proposalRows.filter((p) => p.status === "open" || p.status === "submitted").reverse();
  const candidates = findCandidates(
    obligationRows.filter((row) => row.status === "accepted").map(({ id, debtor, creditor, amount }) => ({ id, debtor, creditor, amount })),
    underWay.map((proposal) => parseClearings(proposal.clearings)),
  );
  const failed = (key: string) => proposalRows.find((p) => p.key === key && p.status === "failed");

  const circles: CircleView[] = [
    ...underWay.map(started),
    ...candidates.map(({ full, netOnly }): CircleView => {
      const circle = option(full.clearings, nobody);
      const alternative = netOnly && option(netOnly.clearings, nobody);
      // If the last attempt at this circle failed, say why.
      const lastAttempt = failed(circle.key) ?? (alternative && failed(alternative.key));
      return { ...circle, netOnly: alternative, proposal: lastAttempt && started(lastAttempt).proposal };
    }),
    ...proposalRows.filter((p) => p.status === "settled").map(started),
  ];

  return {
    contract: NODUS_CONTRACT,
    token: TOKEN_CONTRACT,
    ledger,
    businesses: businessRows.map(({ address, name }) => ({ address, name })),
    obligations: obligationRows.map((row) => ({
      id: row.id.toString(),
      debtor: row.debtor,
      creditor: row.creditor,
      amount: row.amount.toString(),
      originalAmount: row.originalAmount.toString(),
      status: row.status,
      registeredAt: row.registeredAt.toISOString(),
    })),
    circles,
    settlements: settledRows.map((event) => {
      // What a settlement cancelled is in the `cleared` events of its transaction.
      const clearings = clearedRows
        .filter((cleared) => cleared.txHash === event.txHash && cleared.obligationId !== null)
        .map((cleared) => ({ id: cleared.obligationId!, amount: BigInt(cleared.data.amount!) }));
      return {
        txHash: event.txHash,
        closedAt: event.closedAt.toISOString(),
        circle: {
          ...option(clearings, everybody),
          proposal: { id: event.txHash, status: "settled" as const, expirationLedger: event.ledger, txHash: event.txHash },
        },
      };
    }),
    balance: balance?.toString() ?? null,
    faucet: Boolean(process.env.TOKEN_ISSUER_SECRET),
  };
}

/** Orders the parties of a circle the way its debts chain: each one owes the next. */
function alongTheCircle<Party extends { address: string }>(parties: Party[], edges: Array<{ from: string; to: string }>): Party[] {
  const next = new Map(edges.map((edge) => [edge.from, edge.to]));
  const order: string[] = [];
  for (let at: string | undefined = parties[0]?.address; at && !order.includes(at); at = next.get(at)) order.push(at);
  if (order.length !== parties.length) return parties;
  return order.map((address) => parties.find((party) => party.address === address)!);
}
