/**
 * The example businesses: networks made up in advance so that someone can try
 * the app alone. A visitor is handed a business with its suppliers, clients
 * and history, and the server answers for its neighbours: it accepts what the
 * visitor registers against them and signs the circles the visitor signs.
 *
 * Everything still happens on chain, with the same signatures a passkey
 * gives. What is made up is who holds the keys: the installation, instead of
 * a device. They are test keys of businesses that do not exist.
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { rpc, xdr } from "@stellar/stellar-sdk";
import {
  authorizations,
  businesses,
  credentials,
  exampleActors,
  exampleWorlds,
  notes,
  obligations,
  proposals,
  rateLimits,
} from "@nodus/db";
import { NETWORK_PASSPHRASE, WEBAUTHN_VERIFIER, relay, signAsPasskey, type HeldPasskey } from "@nodus/stellar";
import { NODUS_CONTRACT, TOKEN_DECIMALS } from "@/lib/config";
import type { ExampleEntry } from "@/lib/types";
import { latestLedger, nodus, server, tokenBalance } from "./chain";
import { parseClearings } from "./circles";
import { getDb, refresh } from "./db";
import { UserError } from "./errors";
import { hasFaucet, mintTestTokens } from "./faucet";
import { relayerKey } from "./maintenance";
import { addSignature, requestSignature } from "./proposals";
import { derivedKey } from "./session";

type Role = "business" | "neighbor";

/** An account of an example world as the script that made it hands it over. */
export interface ActorInput {
  address: string;
  /** What a neighbour does in the story: `mill` or `carrier`. */
  part?: string;
  passkey: HeldPasskey;
}

interface Actor {
  address: string;
  worldId: string;
  role: Role;
  part: string | null;
  passkey: HeldPasskey;
}

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);
/** What the mill invoices the business, and what the mill owes the carrier: with what the carrier owes the business, a circle. */
const INVOICE = 100n * UNIT;
const FREIGHT = 80n * UNIT;
/** A neighbour is given test tokens when it has less than this, so that it can always pay its net. */
const FLOAT = 300n * UNIT;
const DAY_MS = 24 * 60 * 60_000;
/** Time between one neighbour's signature and the next, so that the app shows them arriving. */
const STAGGER_MS = 2_500;

// --- The keys -------------------------------------------------------------

const sealingKey = () => derivedKey("nodus example passkeys");

function seal(passkey: HeldPasskey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(passkey), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

function unseal(sealed: string): HeldPasskey {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", sealingKey(), iv!);
  decipher.setAuthTag(tag!);
  return JSON.parse(Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8")) as HeldPasskey;
}

// --- The worlds -----------------------------------------------------------

const roles = new Map<string, { worldId: string; role: Role }>();
/** When each address was last found not to be an example account: asked on every read of the state, and almost always so. */
const strangers = new Map<string, number>();
const STRANGER_MS = 60_000;

/** The example world `address` belongs to and its role in it, if it is an example account. */
async function placeOf(address: string): Promise<{ worldId: string; role: Role } | undefined> {
  const known = roles.get(address);
  if (known) return known;
  if (Date.now() - (strangers.get(address) ?? 0) < STRANGER_MS) return undefined;
  const db = await getDb();
  const [row] = await db
    .select({ worldId: exampleActors.worldId, role: exampleActors.role })
    .from(exampleActors)
    .where(eq(exampleActors.address, address));
  if (!row) {
    if (strangers.size > 5_000) strangers.clear();
    strangers.set(address, Date.now());
    return undefined;
  }
  const place = { worldId: row.worldId, role: row.role as Role };
  // An account never changes world, so what was found stays true.
  roles.set(address, place);
  return place;
}

/** Whether `address` is the business of an example world: the one a visitor enters as. */
export async function isExampleBusiness(address: string): Promise<boolean> {
  return (await placeOf(address))?.role === "business";
}

/** The world `address` is the business of, when it is one. */
export async function exampleWorldOf(address: string): Promise<string | undefined> {
  const place = await placeOf(address);
  return place?.role === "business" ? place.worldId : undefined;
}

/**
 * Which businesses of the directory `address` gets to find: an example
 * business only those of its own world, and everyone else none of the made-up ones.
 */
export async function directoryScope(address: string): Promise<SQL> {
  const db = await getDb();
  const worldId = await exampleWorldOf(address);
  const made = db.select({ address: exampleActors.address }).from(exampleActors);
  return worldId ? inArray(businesses.address, made.where(eq(exampleActors.worldId, worldId))) : notInArray(businesses.address, made);
}

async function actorsOf(worldId: string): Promise<Actor[]> {
  const db = await getDb();
  const rows = await db.select().from(exampleActors).where(eq(exampleActors.worldId, worldId));
  return rows.map((row) => ({
    address: row.address,
    worldId: row.worldId,
    role: row.role as Role,
    part: row.part,
    passkey: unseal(row.sealedPasskey),
  }));
}

/**
 * Takes in a world the operator's script finished making. Every account must
 * already be known to the app by the passkey given for it, which is what the
 * script does when it creates them.
 */
export async function addWorld(input: { business: ActorInput; neighbors: ActorInput[] }): Promise<{ id: string }> {
  const actors = [
    { ...input.business, role: "business" as const },
    ...input.neighbors.map((actor) => ({ ...actor, role: "neighbor" as const })),
  ];
  const db = await getDb();
  const known = await db
    .select({ credentialId: credentials.credentialId, address: credentials.address })
    .from(credentials)
    .where(
      inArray(
        credentials.credentialId,
        actors.map((actor) => actor.passkey.credentialId),
      ),
    );
  for (const actor of actors) {
    if (!known.some((record) => record.credentialId === actor.passkey.credentialId && record.address === actor.address)) {
      throw new UserError(`La cuenta ${actor.address} no responde a la passkey que se dio para ella.`);
    }
  }
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(exampleWorlds).values({ id });
    await tx.insert(exampleActors).values(
      actors.map((actor) => ({
        address: actor.address,
        worldId: id,
        role: actor.role,
        part: actor.part ?? null,
        sealedPasskey: seal(actor.passkey),
      })),
    );
  });
  return { id };
}

/**
 * Takes out of the directory the accounts of a world that its script could not
 * finish, so that nobody finds businesses nobody answers for. Accounts of a
 * world that was taken in are left alone. Says how many names were removed.
 */
export async function forgetUnfinished(addresses: string[]): Promise<{ forgotten: number }> {
  if (addresses.length === 0) return { forgotten: 0 };
  const db = await getDb();
  const forgotten = await db
    .delete(businesses)
    .where(
      and(
        inArray(businesses.address, addresses),
        notInArray(businesses.address, db.select({ address: exampleActors.address }).from(exampleActors)),
      ),
    )
    .returning({ address: businesses.address });
  return { forgotten: forgotten.length };
}

/** How many worlds wait for a visitor and how many were handed out. */
export async function worldCounts(): Promise<{ waiting: number; claimed: number }> {
  const db = await getDb();
  const [[waiting], [claimed]] = await Promise.all([
    db.select({ n: count() }).from(exampleWorlds).where(isNull(exampleWorlds.claimedAt)),
    db.select({ n: count() }).from(exampleWorlds).where(isNotNull(exampleWorlds.claimedAt)),
  ]);
  return { waiting: waiting?.n ?? 0, claimed: claimed?.n ?? 0 };
}

/**
 * Hands a visitor an example business of their own. When every world has been
 * handed out, the one handed out longest ago is given again: whoever had it
 * has most likely left.
 */
export async function claimWorld(): Promise<ExampleEntry> {
  const db = await getDb();
  let worldId: string | undefined;
  // Two visitors may reach for the same world at once; the one that loses looks again.
  for (let attempt = 0; attempt < 5 && !worldId; attempt++) {
    const [fresh] = await db
      .select()
      .from(exampleWorlds)
      .where(isNull(exampleWorlds.claimedAt))
      .orderBy(asc(exampleWorlds.createdAt))
      .limit(1);
    const [oldest] = fresh ? [] : await db.select().from(exampleWorlds).orderBy(asc(exampleWorlds.claimedAt)).limit(1);
    const pick = fresh ?? oldest;
    if (!pick) break;
    const taken = await db
      .update(exampleWorlds)
      .set({ claimedAt: new Date() })
      .where(
        and(eq(exampleWorlds.id, pick.id), pick.claimedAt ? eq(exampleWorlds.claimedAt, pick.claimedAt) : isNull(exampleWorlds.claimedAt)),
      )
      .returning({ id: exampleWorlds.id });
    worldId = taken[0]?.id;
  }
  if (!worldId) throw new UserError("Ahora no hay negocios de ejemplo disponibles. Puedes crear el tuyo con una passkey.");

  const business = (await actorsOf(worldId)).find((actor) => actor.role === "business")!;
  const [named] = await db.select().from(businesses).where(eq(businesses.address, business.address));
  const privateKey = createPrivateKey({ key: Buffer.from(business.passkey.privateKey, "base64"), format: "der", type: "pkcs8" });
  return {
    address: business.address,
    name: named?.name ?? "Negocio de ejemplo",
    credentialId: business.passkey.credentialId,
    privateKey: privateKey.export({ format: "jwk" }) as JsonWebKey,
  };
}

// --- What the neighbours do -------------------------------------------------

/** Where a browser would have signed from; the account's verifier does not look at it. */
const origin = () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type Draft = { built?: { operations: unknown[] }; simulationData: { result: { auth: xdr.SorobanAuthorizationEntry[] } } };

/** Signs a call to Nodus as `actor` and sends it through the relayer, waiting for the network to confirm it. */
async function send(actor: Actor, draft: Draft): Promise<void> {
  const operation = draft.built!.operations[0] as { func: xdr.HostFunction };
  const expiration = (await latestLedger()) + 100;
  const auth = await Promise.all(
    draft.simulationData.result.auth.map((entry) =>
      signAsPasskey(entry, actor.passkey, {
        expiration,
        networkPassphrase: NETWORK_PASSPHRASE,
        verifier: WEBAUTHN_VERIFIER,
        origin: origin(),
      }),
    ),
  );
  const txHash = await relay(
    relayerKey(),
    operation.func.toXDR("base64"),
    auth.map((entry) => entry.toXDR("base64")),
  );
  const result = await server.pollTransaction(txHash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`The transaction ended as ${result.status}`);
}

const accept = async (debtor: Actor, id: bigint) => send(debtor, await nodus.accept({ id }));

/** The creditor registers that `debtor` owes it `amount`, with the document behind it. */
async function register(creditor: Actor, debtor: string, amount: bigint, note?: string, due?: Date): Promise<bigint> {
  const draw = () =>
    nodus.register({
      creditor: creditor.address,
      debtor,
      amount,
      reference: note ? createHash("sha256").update(note).digest() : undefined,
      due: due ? BigInt(Math.floor(due.getTime() / 1000)) : undefined,
    });
  let draft = await draw();
  try {
    await send(creditor, draft);
  } catch {
    // A debt takes the next number: when someone else registers one in the same moment, the number this one was drawn up with is taken.
    draft = await draw();
    await send(creditor, draft);
  }
  const id = draft.result.unwrap();
  if (note) {
    const db = await getDb();
    await db.insert(notes).values({ contractId: NODUS_CONTRACT, obligationId: id, text: note }).onConflictDoNothing();
  }
  return id;
}

/** The neighbour signs its part of a circle that is gathering signatures. */
async function sign(neighbor: Actor, clearings: Array<{ id: string; amount: string }>): Promise<void> {
  const request = await requestSignature(parseClearings(clearings), neighbor.address);
  const signed = await signAsPasskey(xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64"), neighbor.passkey, {
    expiration: request.expirationLedger,
    networkPassphrase: NETWORK_PASSPHRASE,
    verifier: WEBAUTHN_VERIFIER,
    origin: origin(),
  });
  await addSignature(request.proposalId, neighbor.address, signed.toXDR("base64"));
}

/**
 * Takes a step for itself, so that two instances of the app do not take it
 * twice: true for the first to ask within `ms`. A step that failed can be
 * tried again once that time has gone by.
 */
async function claim(step: string, ms = 90_000): Promise<boolean> {
  const db = await getDb();
  const resetAt = new Date(Date.now() + ms);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `tend:${step}`, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} < now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} < now() then ${resetAt.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row?.count === 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Does `work` if this instance gets to, and says whether it did. A failure is logged and left for a later pass. */
async function attempt(step: string, work: () => Promise<void>): Promise<boolean> {
  if (!(await claim(step))) return false;
  try {
    await work();
    return true;
  } catch (error) {
    console.error(`Example world: ${step} failed`, error);
    return false;
  }
}

/** When each world was last looked at for what it lacks to close another circle. */
const readiedAt = new Map<string, number>();
const READY_CHECK_MS = 15_000;

/** One pass over a world: what its neighbours have to answer right now. Says whether anything was done. */
async function tendOnce(actors: Actor[]): Promise<boolean> {
  const db = await getDb();
  const business = actors.find((actor) => actor.role === "business")!;
  const neighbors = actors.filter((actor) => actor.role === "neighbor");
  const byAddress = new Map(actors.map((actor) => [actor.address, actor]));
  const here = eq(obligations.contractId, NODUS_CONTRACT);
  let did = false;

  // What the visitor registered against a neighbour, the neighbour accepts.
  const registered = await db
    .select()
    .from(obligations)
    .where(
      and(
        here,
        eq(obligations.status, "pending"),
        eq(obligations.creditor, business.address),
        inArray(
          obligations.debtor,
          neighbors.map((neighbor) => neighbor.address),
        ),
      ),
    );
  for (const debt of registered) {
    did = (await attempt(`accept:${debt.id}`, () => accept(byAddress.get(debt.debtor)!, debt.id))) || did;
  }

  // A circle that someone of this world started signing, its neighbours sign too.
  const waiting = await db
    .select({ proposal: proposals })
    .from(proposals)
    .innerJoin(authorizations, eq(authorizations.proposalId, proposals.id))
    .where(and(eq(proposals.contractId, NODUS_CONTRACT), eq(proposals.status, "open"), eq(authorizations.address, business.address)));
  for (const { proposal } of waiting) {
    const parties = await db.select().from(authorizations).where(eq(authorizations.proposalId, proposal.id));
    // Neighbours only sign among themselves and the business they were made for.
    if (!parties.every((party) => byAddress.has(party.address)) || !parties.some((party) => party.signedEntry)) continue;
    for (const party of parties) {
      const neighbor = byAddress.get(party.address)!;
      if (party.signedEntry || neighbor.role !== "neighbor") continue;
      await sleep(STAGGER_MS);
      did = (await attempt(`sign:${proposal.id}:${neighbor.address}`, () => sign(neighbor, proposal.clearings))) || did;
    }
  }
  if (did || waiting.length > 0) return did;

  // Nothing waits: leave the world ready for another circle. Looked at now and then, not on every read.
  if (Date.now() - (readiedAt.get(business.worldId) ?? 0) < READY_CHECK_MS) return false;
  readiedAt.set(business.worldId, Date.now());
  const mill = neighbors.find((neighbor) => neighbor.part === "mill");
  const carrier = neighbors.find((neighbor) => neighbor.part === "carrier");
  if (!mill || !carrier) return false;

  if (hasFaucet()) {
    for (const neighbor of [mill, carrier]) {
      if ((await tokenBalance(neighbor.address)) < FLOAT) {
        did = (await attempt(`fund:${neighbor.address}`, async () => void (await mintTestTokens(neighbor.address)))) || did;
      }
    }
  }
  const open = inArray(obligations.status, ["pending", "accepted"]);
  const debts = (debtor: Actor, creditor: Actor, which?: typeof open) =>
    db
      .select({ id: obligations.id })
      .from(obligations)
      .where(and(here, eq(obligations.debtor, debtor.address), eq(obligations.creditor, creditor.address), which));
  if ((await debts(mill, carrier, open)).length === 0) {
    did =
      (await attempt(`freight:${business.worldId}`, async () => {
        await accept(mill, await register(carrier, mill.address, FREIGHT));
      })) || did;
  }
  if ((await debts(business, mill, open)).length === 0) {
    // A new invoice of the mill, for the visitor to accept: each one takes the next number.
    const invoices = (await debts(business, mill)).length;
    did =
      (await attempt(`invoice:${business.worldId}`, async () => {
        await register(mill, business.address, INVOICE, `Factura ${2291 + invoices}`, new Date(Date.now() + 14 * DAY_MS));
      })) || did;
  }
  return did;
}

const tending = new Set<string>();
/** How many passes one call may take: an acceptance may complete a circle, whose signatures may settle it. */
const MAX_PASSES = 4;

/**
 * Has the neighbours of the example world of `address` answer what waits for
 * them. Called when its visitor looks at the app, and left to run after the
 * response: each step is a transaction the network has to confirm.
 */
export async function tendExampleWorld(address: string): Promise<void> {
  const worldId = await exampleWorldOf(address);
  if (!worldId || tending.has(worldId)) return;
  tending.add(worldId);
  try {
    const actors = await actorsOf(worldId);
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      if (!(await tendOnce(actors))) break;
      await refresh(true);
    }
  } catch (error) {
    console.error("Example world: could not tend it", error);
  } finally {
    tending.delete(worldId);
  }
}
