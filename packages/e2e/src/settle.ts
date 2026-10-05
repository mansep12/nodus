/**
 * End-to-end settlement on testnet with passkey smart accounts.
 *
 * For each ring size given on the command line, N businesses owe each other in
 * a circle, every one signs its own authorization entry with its passkey, and a
 * single transaction cancels all the debts and moves only the nets. Reports the
 * resources that transaction used against the network limits.
 *
 *   bun run settle 3 4 5
 *   bun run settle 3 --relayer   # the settlement is submitted and paid by the relayer
 */
import { scValToNative } from "@stellar/stellar-sdk";
import type { Clearing } from "@nodus/contract-client";
import { UNIT, balance, createBusiness, deployWorld, log, owe, settle, units, type Business, type World } from "./harness.ts";
import { TX_LIMITS, declaredResources } from "./testnet.ts";

const args = process.argv.slice(2);
const viaRelayer = args.includes("--relayer");
const sizes = args.filter((arg) => !arg.startsWith("--")).map(Number);
if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n < 2)) {
  throw new Error("Usage: bun run settle <ring size> [<ring size> ...] [--relayer]");
}

async function settleRing(world: World, ring: Business[]) {
  const n = ring.length;
  log(`--- Ring of ${n} ---`);

  // Business i owes business i+1, with amounts that grow along the ring so
  // that everyone but the first ends up paying a net: the costliest shape.
  const clearings: Clearing[] = [];
  for (let i = 0; i < n; i++) {
    const amount = BigInt(100 + 10 * i) * UNIT;
    clearings.push({ id: await owe(world, ring[i]!, ring[(i + 1) % n]!, amount), amount });
  }

  const balances = () => Promise.all(ring.map((business) => balance(world, business)));
  const before = await balances();
  const result = await settle(world, clearings, ring, viaRelayer);
  const after = await balances();

  const moved = scValToNative(result.returnValue!) as bigint;
  const cleared = clearings.reduce((total, c) => total + c.amount, 0n);
  log(`Settled in ${result.txHash}: ${units(cleared)} of debt cancelled moving ${units(moved)}`);
  ring.forEach((b, i) => log(`  ${b.name}: ${units(after[i]! - before[i]!)}`));
  for (const { id } of clearings) {
    if ((await world.nodus.obligation({ id })).result.isOk()) throw new Error(`Obligation ${id} still exists`);
  }

  return { parties: n, hash: result.txHash, ...declaredResources(result) };
}

const world = await deployWorld();
const businesses: Business[] = [];
for (let i = 0; i < Math.max(...sizes); i++) {
  // Enough to pay a net of 10 in every ring.
  const funds = BigInt(10 * sizes.length) * UNIT;
  businesses.push(await createBusiness(world, `Negocio ${String.fromCharCode(65 + i)}`, funds));
}

const reports = [];
for (const n of sizes) reports.push(await settleRing(world, businesses.slice(0, n)));

const share = (used: number, limit: number) => `${used.toLocaleString("en")} (${((100 * used) / limit).toFixed(1)}%)`;
console.table(
  reports.map((r) => ({
    parties: r.parties,
    instructions: share(r.instructions, TX_LIMITS.instructions),
    "disk read bytes": share(r.diskReadBytes, TX_LIMITS.diskReadBytes),
    "write bytes": share(r.writeBytes, TX_LIMITS.writeBytes),
    "write entries": share(r.writeEntries, TX_LIMITS.writeEntries),
    "footprint entries": share(r.footprintEntries, TX_LIMITS.footprintEntries),
    "tx size bytes": share(r.sizeBytes, TX_LIMITS.sizeBytes),
    "fee (XLM)": (r.feeStroops / 1e7).toFixed(4),
  })),
);
for (const r of reports) console.log(`${r.parties} parties: https://stellar.expert/explorer/testnet/tx/${r.hash}`);
