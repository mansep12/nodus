/**
 * Proposals gather the signatures a settlement needs. The server only stores
 * and forwards them: every party signs the exact `settle` invocation with its
 * own passkey, and the contract checks all of it again on chain.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, max } from "drizzle-orm";
import { rpc, xdr } from "@stellar/stellar-sdk";
import { authorizations, businesses, proposals, type Db } from "@nodus/db";
import { settleable } from "@nodus/indexer";
import type { Clearing } from "@nodus/solver";
import { NETWORK_PASSPHRASE, addressCredentials, entryAddress, isSignedByPasskey, relay } from "@nodus/stellar";
import { NODUS_CONTRACT, TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import type { SigningRequest } from "@/lib/types";
import { accountSigner, latestLedger, nodus, server, tokenBalance } from "./chain";
import { currentCandidates } from "./circles";
import { getDb, refresh } from "./db";
import { UserError } from "./errors";

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
    const created = await create(db, sorted, key);
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

async function create(db: Db, clearings: Clearing[], key: string): Promise<Proposal | undefined> {
  await refresh(true);
  // Only circles the solver finds can be started, so that nobody can tie
  // debts up in proposals of their own invention.
  const offered = (await currentCandidates(db))
    .flatMap((candidate) => (candidate.netOnly ? [candidate.full, candidate.netOnly] : [candidate.full]))
    .find((candidate) => clearingsKey(candidate.clearings) === key);
  if (!offered) throw new UserError("Ese círculo ya no está disponible. Revisa los círculos actualizados.");

  // The contract would reject it anyway, but this way the reason is clear.
  for (const party of offered.parties) {
    if (party.net >= 0n) continue;
    const balance = await tokenBalance(party.address);
    if (balance < -party.net) {
      const [business] = await db.select().from(businesses).where(eq(businesses.address, party.address));
      throw new UserError(
        `${business?.name ?? "Un participante"} necesita ${formatAmount(-party.net)} ${TOKEN_SYMBOL} para pagar su saldo neto y tiene ${formatAmount(balance)}.`,
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
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(proposals).values(proposal).onConflictDoNothing().returning();
    if (!created) return undefined;
    await tx
      .insert(authorizations)
      .values(entries.map((entry) => ({ proposalId: created.id, address: entryAddress(entry), entry: entry.toXDR("base64") })));
    return created;
  });
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
  const signer = await accountSigner(address);
  const signed = xdr.SorobanAuthorizationEntry.fromXDR(signedEntry, "base64");
  if (!signer || !(await isSignedByPasskey(signed, signer, NETWORK_PASSPHRASE))) {
    throw new UserError("La firma no es válida para esta cuenta.");
  }
  await db.update(authorizations).set({ signedEntry, signedAt: new Date() }).where(mine);

  const all = await db.select().from(authorizations).where(eq(authorizations.proposalId, proposalId));
  if (all.every((a) => a.signedEntry))
    await settle(
      db,
      proposal,
      all.map((a) => a.signedEntry!),
    );
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
    const apiKey = process.env.OZ_CHANNELS_API_KEY;
    if (!apiKey) throw new Error("OZ_CHANNELS_API_KEY is not set");
    const txHash = await relay(apiKey, proposal.func, signedEntries);
    await mark({ txHash });
    const result = await server.pollTransaction(txHash, { attempts: 20 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Transaction ended as ${result.status}`);
    await mark({ status: "settled" });
    await refresh(true);
  } catch (error) {
    console.error(error);
    await mark({ status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Closes the proposals that can no longer be completed: expired ones, those
 * whose debts changed underneath them, and any left mid-submission.
 */
export async function closeStaleProposals(db: Db): Promise<void> {
  const fail = (id: string, error: string) => db.update(proposals).set({ status: "failed", error }).where(eq(proposals.id, id));
  const here = eq(proposals.contractId, NODUS_CONTRACT);

  await db
    .update(proposals)
    .set({ status: "failed", error: "El plazo para firmar venció." })
    .where(and(here, eq(proposals.status, "open"), lte(proposals.expirationLedger, await latestLedger())));

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
    if (!proposal.txHash) {
      const [signatures] = await db
        .select({ lastAt: max(authorizations.signedAt) })
        .from(authorizations)
        .where(eq(authorizations.proposalId, proposal.id));
      const waited = Date.now() - (signatures?.lastAt?.getTime() ?? 0);
      if (waited > SUBMISSION_TIMEOUT_MS) await fail(proposal.id, "El envío no terminó. Hay que firmar de nuevo.");
      continue;
    }
    const { status } = await server.getTransaction(proposal.txHash);
    if (status === rpc.Api.GetTransactionStatus.SUCCESS) {
      await db.update(proposals).set({ status: "settled" }).where(eq(proposals.id, proposal.id));
    } else if (status === rpc.Api.GetTransactionStatus.FAILED) {
      await fail(proposal.id, "La transacción falló en la red.");
    }
  }
}
