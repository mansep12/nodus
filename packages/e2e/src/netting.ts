/**
 * End-to-end netting on testnet: debts are registered on chain, the indexer
 * copies them into Postgres, the solver finds the circle among them, every
 * party signs and one transaction settles it.
 *
 *   bun run netting             # the operator pays the settlement fee
 *   bun run netting --relayer   # the relayer submits and pays
 *
 * Uses the Postgres at DATABASE_URL, or an embedded one in memory.
 */
import { asc, eq } from "drizzle-orm";
import { connect, obligations } from "@nodus/db";
import { settleable, sync } from "@nodus/indexer";
import { propose } from "@nodus/solver";
import { UNIT, balance, createBusiness, deployWorld, log, owe, settle, units } from "./harness.ts";
import { server } from "./testnet.ts";

const viaRelayer = process.argv.includes("--relayer");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const world = await deployWorld();
const bakery = await createBusiness(world, "Panadería", 10n * UNIT);
const mill = await createBusiness(world, "Molino");
const carrier = await createBusiness(world, "Transportes", 10n * UNIT);
const printer = await createBusiness(world, "Imprenta");
const businesses = [bakery, mill, carrier, printer];
const nameOf = (address: string) => businesses.find((b) => b.address === address)?.name ?? address;

// A circle of three, plus two debts that are not part of any circle.
await owe(world, bakery, mill, 100n * UNIT);
await owe(world, mill, carrier, 80n * UNIT);
await owe(world, carrier, bakery, 90n * UNIT);
await owe(world, printer, bakery, 50n * UNIT);
await owe(world, printer, mill, 30n * UNIT, false);

const db = await connect({ url: process.env.DATABASE_URL });
const indexing = { server, contractId: world.nodusId, startLedger: world.deployLedger };
log(`Indexed ${await sync(db, indexing)} events`);

const proposals = propose(await settleable(db, world.nodusId));
assert(proposals.length === 1, `expected one circle, found ${proposals.length}`);
const [proposal] = proposals;
log(`Circle found: ${units(proposal!.cleared)} of debt can be cancelled moving ${units(proposal!.moved)}`);
for (const party of proposal!.parties) {
  const net = party.net === 0n ? "pays nothing" : party.net > 0n ? `receives ${units(party.net)}` : `pays ${units(-party.net)}`;
  log(`  ${nameOf(party.address)}: owes ${units(party.owesLess)} less, is owed ${units(party.owedLess)} less, ${net}`);
}
assert(proposal!.parties.length === 3, "the circle has three parties");
assert(proposal!.cleared === 270n * UNIT && proposal!.moved === 20n * UNIT, "270 cancelled moving 20");

const before = await Promise.all(businesses.map((b) => balance(world, b)));
const result = await settle(world, proposal!.clearings, businesses, viaRelayer);
log(`Settled in https://stellar.expert/explorer/testnet/tx/${result.txHash}`);
const after = await Promise.all(businesses.map((b) => balance(world, b)));
businesses.forEach((b, i) => log(`  ${b.name}: ${units(after[i]! - before[i]!)}`));

log(`Indexed ${await sync(db, indexing)} events`);
const rows = await db.select().from(obligations).where(eq(obligations.contractId, world.nodusId)).orderBy(asc(obligations.id));
console.table(
  rows.map((row) => ({
    id: Number(row.id),
    debtor: nameOf(row.debtor),
    creditor: nameOf(row.creditor),
    owed: units(row.amount),
    original: units(row.originalAmount),
    status: row.status,
  })),
);
assert(rows.map((row) => row.status).join() === "settled,settled,settled,accepted,pending", "statuses after settling");
assert(propose(await settleable(db, world.nodusId)).length === 0, "no circle is left");
log("Prueba 2 OK");
process.exit(0);
