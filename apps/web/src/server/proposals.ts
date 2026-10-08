/**
 * Proposals gather the signatures a settlement needs. The server only stores
 * and forwards them: every party signs the exact `settle` invocation with its
 * own passkey, and the contract checks all of it again on chain.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, max } from "drizzle-orm";
import { rpc, xdr } from "@stellar/stellar-sdk";
import { authorizations, proposals, type Db } from "@nodus/db";
import { settleable } from "@nodus/indexer";
import type { Clearing } from "@nodus/solver";
import { NETWORK_PASSPHRASE, addressCredentials, entryAddress, isSignedByPasskey, relay, signedRuleId } from "@nodus/stellar";
import { NODUS_CONTRACT, TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import type { SigningRequest } from "@/lib/types";
import { accountRule, forgetBalances, isOwnerRule, latestLedger, nodus, passkeySigners, server, tokenBalance } from "./chain";
import { currentCandidates, recomputeCandidates } from "./circles";
import { getDb, refresh } from "./db";
import { UserError } from "./errors";
import { relayerKey } from "./maintenance";
import { notifyChanges } from "./notify";

type Proposal = typeof proposals.$inferSelect;

/** How long the parties have to sign: about a day. */
const VALIDITY_LEDGERS = 17_280;
/** How long sending the settlement may take before it is considered lost. */
const SUBMISSION_TIMEOUT_MS = 120_000;

const byId = (a: Clearing, b: Clearing) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Identifies a set of clearings regardless of the order they are given in. */
export function clearingsKey(clearings: Clearing[]): string {
  const canonical = [...clearings].sort(byId).map((c) => `${c.id}:${c.amount}`);
  return createHash("sha256")
    .update(`${NODUS_CONTRACT}|${canonical.join(",")}`)
    .digest("hex");
}

const underWay = (key: string) =>
  and(eq(proposals.contractId, NODUS_CONTRACT), eq(proposals.key, key), inArray(proposals.status, ["open", "submitted"]));

/**
 * What `address` must sign to settle `clearings`. The first party to ask
 * starts the proposal; the rest join it.
 */
export async function requestSignature(clearings: Clearing[], address: string): Promise<SigningRequest> {
  if (clearings.length === 0) throw new UserError("El círculo no tiene deudas.");
  const sorted = [...clearings].sort(byId);
  const key = clearingsKey(sorted);
  const db = await getDb();

  let [proposal] = await db.select().from(proposals).where(underWay(key));
  if (!proposal) {
    const created = await create(db, sorted, key, address);
    // Someone else may have started it at the same moment; theirs wins.
    [proposal] = created ? [created] : await db.select().from(proposals).where(underWay(key));
  }
  if (!proposal || proposal.status !== "open") throw new UserError("Este círculo ya se está liquidando.");

  const [authorization] = await db
    .select()
    .from(authorizations)
    .where(and(eq(authorizations.proposalId, proposal.id), eq(authorizations.address, address)));
  if (!authorization) throw new UserError("Tu cuenta no participa en este círculo.");
  if (authorization.signedEntry) throw new UserError("Ya firmaste este círculo.");
  return { proposalId: proposal.id, entry: authorization.entry, expirationLedger: proposal.expirationLedger };
}

async function create(db: Db, clearings: Clearing[], key: string, address: string): Promise<Proposal | undefined> {
  await refresh(true);
  // Only circles the solver finds can be started, so that nobody can tie
  // debts up in proposals of their own invention.
  const offered = (await currentCandidates(db)).candidates
    .flatMap((candidate) => (candidate.netOnly ? [candidate.full, candidate.netOnly] : [candidate.full]))
    .find((candidate) => clearingsKey(candidate.clearings) === key);
  if (!offered) throw new UserError("Ese círculo ya no está disponible. Revisa los círculos actualizados.");
  // A proposal sets its debts aside until it expires: only a party of the circle gets to start one.
  if (!offered.parties.some((party) => party.address === address)) throw new UserError("Tu cuenta no participa en este círculo.");

  // The contract would reject it anyway, but this way the reason is clear. Only
  // the asker's own shortfall is spelled out: the others are not its business.
  for (const party of offered.parties) {
    if (party.net >= 0n) continue;
    const balance = await tokenBalance(party.address, true);
    if (balance < -party.net) {
      throw new UserError(
        party.address === address
          ? `Necesitas ${formatAmount(-party.net)} ${TOKEN_SYMBOL} para pagar tu saldo neto y tienes ${formatAmount(balance)}.`
          : "A otro negocio del círculo todavía no le alcanza el saldo para pagar su parte. Pueden compensar sin mover dinero.",
      );
    }
  }

  // Simulating without signatures tells what each party has to authorize.
  const draft = await nodus.settle({ clearings });
  const operation = draft.built!.operations[0] as { func: xdr.HostFunction };
  const entries = draft.simulationData.result.auth;

  const proposal = {
    id: randomUUID(),
    contractId: NODUS_CONTRACT,
    key,
    clearings: clearings.map((c) => ({ id: c.id.toString(), amount: c.amount.toString() })),
    func: operation.func.toXDR("base64"),
    expirationLedger: (await latestLedger()) + VALIDITY_LEDGERS,
  };
  const created = await db.transaction(async (tx) => {
    const [created] = await tx.insert(proposals).values(proposal).onConflictDoNothing().returning();
    if (!created) return undefined;
    await tx
      .insert(authorizations)
      .values(entries.map((entry) => ({ proposalId: created.id, address: entryAddress(entry), entry: entry.toXDR("base64") })));
    return created;
  });
  // The debts of this circle are spoken for now: the others get searched again.
  if (created) await recomputeCandidates(db);
  return created;
}

/** Records the signature of `address` and, if it was the last one missing, settles. */
export async function addSignature(proposalId: string, address: string, signedEntry: string): Promise<void> {
  const db = await getDb();
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal || proposal.status !== "open") throw new UserError("Este círculo ya no está abierto a firmas.");
  if (proposal.expirationLedger <= (await latestLedger())) throw new UserError("El plazo para firmar este círculo venció.");

  const mine = and(eq(authorizations.proposalId, proposalId), eq(authorizations.address, address));
  const [authorization] = await db.select().from(authorizations).where(mine);
  if (!authorization) throw new UserError("Tu cuenta no participa en este círculo.");
  if (!isSignatureOf(signedEntry, authorization.entry, address, proposal.expirationLedger)) {
    throw new UserError("La firma no corresponde a este círculo.");
  }
  // A signature that the account would reject on chain is refused here, so
  // that nobody can spoil a proposal by signing in someone else's name.
  if (!(await isOwnerSignature(signedEntry, address))) throw new UserError("La firma no es válida para esta cuenta.");
  await db.update(authorizations).set({ signedEntry, signedAt: new Date() }).where(mine);

  const all = await db.select().from(authorizations).where(eq(authorizations.proposalId, proposalId));
  if (all.every((a) => a.signedEntry))
    await settle(
      db,
      proposal,
      all.map((a) => a.signedEntry!),
    );
  else await notifyChanges(db).catch((error) => console.error("Could not send notifications", error));
}

/**
 * Whether `signedXdr` carries a signature the account `address` would accept
 * for a settlement: made by one of the passkeys of a rule that may authorize
 * anything (a `Default` rule with no policies), under that rule.
 */
async function isOwnerSignature(signedXdr: string, address: string): Promise<boolean> {
  const signed = xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, "base64");
  const ruleId = signedRuleId(signed);
  if (ruleId === undefined) return false;
  const rule = await accountRule(address, ruleId);
  if (!isOwnerRule(rule)) return false;
  for (const signer of passkeySigners(rule)) {
    if (await isSignedByPasskey(signed, signer, NETWORK_PASSPHRASE, ruleId)) return true;
  }
  return false;
}

/**
 * Whether `signedXdr` is the entry we asked `address` to sign, with something
 * in the place of the signature.
 */
function isSignatureOf(signedXdr: string, expectedXdr: string, address: string, expirationLedger: number): boolean {
  try {
    const signed = xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, "base64");
    const expected = xdr.SorobanAuthorizationEntry.fromXDR(expectedXdr, "base64");
    const credentials = addressCredentials(signed);
    return (
      entryAddress(signed) === address &&
      signed.rootInvocation().toXDR("base64") === expected.rootInvocation().toXDR("base64") &&
      credentials.nonce().toString() === addressCredentials(expected).nonce().toString() &&
      credentials.signatureExpirationLedger() === expirationLedger &&
      credentials.signature().switch().name !== "scvVoid"
    );
  } catch {
    return false;
  }
}

/** Sends the one transaction that carries every signature. */
async function settle(db: Db, proposal: Proposal, signedEntries: string[]): Promise<void> {
  const mark = (values: Partial<Proposal>) => db.update(proposals).set(values).where(eq(proposals.id, proposal.id));

  // Two parties may sign last at once; only one of the requests gets to send.
  const claimed = await db
    .update(proposals)
    .set({ status: "submitted" })
    .where(and(eq(proposals.id, proposal.id), eq(proposals.status, "open")))
    .returning({ id: proposals.id });
  if (claimed.length === 0) return;

  try {
    const txHash = await relay(relayerKey(), proposal.func, signedEntries);
    await mark({ txHash });
    const result = await server.pollTransaction(txHash, { attempts: 20 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Transaction ended as ${result.status}`);
    await mark({ status: "settled" });
    forgetBalances();
    await refresh(true);
  } catch (error) {
    console.error(error);
    await mark({ status: "failed", error: explainSubmission(error) });
    await recomputeCandidates(db);
  }
}

/** What went wrong sending a settlement, in the words of the person who will read it. */
function explainSubmission(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ended as FAILED/i.test(message)) return "La red rechazó la transacción. Puede que una deuda o un saldo haya cambiado.";
  if (/ended as NOT_FOUND/i.test(message)) return "La red no confirmó la transacción a tiempo.";
  if (/not set/i.test(message)) return "Esta instalación no tiene relayer configurado.";
  if (/insufficient|balance|underfunded/i.test(message)) return "A un participante no le alcanzó el saldo para pagar su neto.";
  return "El envío a la red falló. Hay que firmar de nuevo.";
}

/**
 * Closes the proposals that can no longer be completed: expired ones, those
 * whose debts changed underneath them, and any left mid-submission.
 */
export async function closeStaleProposals(db: Db): Promise<number> {
  let closed = 0;
  const fail = async (id: string, error: string) => {
    await db.update(proposals).set({ status: "failed", error }).where(eq(proposals.id, id));
    closed++;
  };
  const here = eq(proposals.contractId, NODUS_CONTRACT);

  const expired = await db
    .update(proposals)
    .set({ status: "failed", error: "El plazo para firmar venció." })
    .where(and(here, eq(proposals.status, "open"), lte(proposals.expirationLedger, await latestLedger())))
    .returning({ id: proposals.id });
  closed += expired.length;

  const open = await db
    .select()
    .from(proposals)
    .where(and(here, eq(proposals.status, "open")));
  if (open.length > 0) {
    const owed = new Map((await settleable(db, NODUS_CONTRACT)).map((o) => [o.id.toString(), o.amount]));
    for (const proposal of open) {
      const valid = proposal.clearings.every((c) => BigInt(c.amount) <= (owed.get(c.id) ?? 0n));
      if (!valid) await fail(proposal.id, "Las deudas de este círculo cambiaron.");
    }
  }

  // A proposal stays `submitted` only if the request that was sending it died.
  const stuck = await db
    .select()
    .from(proposals)
    .where(and(here, eq(proposals.status, "submitted")))
    .orderBy(asc(proposals.createdAt));
  for (const proposal of stuck) {
    const [signatures] = await db
      .select({ lastAt: max(authorizations.signedAt) })
      .from(authorizations)
      .where(eq(authorizations.proposalId, proposal.id));
    const waited = Date.now() - (signatures?.lastAt?.getTime() ?? 0);
    const status = proposal.txHash ? (await server.getTransaction(proposal.txHash)).status : rpc.Api.GetTransactionStatus.NOT_FOUND;
    if (status === rpc.Api.GetTransactionStatus.SUCCESS) {
      await db.update(proposals).set({ status: "settled" }).where(eq(proposals.id, proposal.id));
      closed++;
    } else if (status === rpc.Api.GetTransactionStatus.FAILED) {
      await fail(proposal.id, "La transacción falló en la red.");
    } else if (waited > SUBMISSION_TIMEOUT_MS) {
      // Never sent, or sent and never seen by the network: either way the signatures are spent.
      await fail(proposal.id, "El envío no terminó. Hay que firmar de nuevo.");
    }
  }
  return closed;
}
