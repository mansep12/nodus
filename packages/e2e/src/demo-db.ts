/**
 * Looks into the database of the demo instance, with the app stopped (the
 * embedded Postgres takes one process at a time): `bash pitch/demo.sh cuenta`
 * and `bash pitch/demo.sh limites` stop the app, run this and start it again.
 *
 *   bun run src/demo-db.ts cuenta <data dir> [name of the business]   # what the business has: debts, circles, passkeys
 *   bun run src/demo-db.ts limites <data dir>                         # forgets the rate limits counted so far
 *   bun run src/demo-db.ts invitacion <data dir> [name]               # the id of the device invitation that waits for a passkey
 */
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { businesses, connect, credentials, invitations, obligations, proposals, rateLimits } from "@nodus/db";
import { units } from "./harness.ts";

const [command, dataDir, name = "Panadería Sur"] = process.argv.slice(2);
if (!dataDir || !["cuenta", "limites", "invitacion"].includes(command ?? "")) {
  throw new Error("Usage: bun run src/demo-db.ts cuenta|limites|invitacion <data dir> [name of the business]");
}
const db = await connect({ dataDir: path.join(dataDir, "postgres") });

if (command === "limites") {
  const counted = await db.delete(rateLimits).returning({ key: rateLimits.key, count: rateLimits.count });
  console.log(`Límites en cero (${counted.map((row) => `${row.key}: ${row.count}`).join(", ") || "no había ninguno"}).`);
  process.exit(0);
}

if (command === "invitacion") {
  // Only the id goes to the output, for the script that asks.
  const [waiting] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .innerJoin(businesses, eq(businesses.address, invitations.address))
    .where(and(eq(businesses.name, name), eq(invitations.role, "owner"), eq(invitations.status, "pending")))
    .orderBy(desc(invitations.createdAt));
  if (waiting) console.log(waiting.id);
  process.exit(0);
}

const everyone = await db.select().from(businesses).orderBy(businesses.createdAt);
const nameOf = (address: string) => everyone.find((business) => business.address === address)?.name ?? address.slice(0, 6);
const repeated = everyone.filter((business, index) => everyone.findIndex((other) => other.name === business.name) !== index);
console.log(`Negocios (${everyone.length}): ${everyone.map((business) => business.name).join(", ")}`);
if (repeated.length > 0) console.log(`  REPETIDOS: ${repeated.map((business) => business.name).join(", ")}`);

const mine = everyone.filter((business) => business.name === name);
if (mine.length !== 1) {
  console.log(mine.length === 0 ? `No hay ningún negocio llamado "${name}".` : `Hay ${mine.length} negocios llamados "${name}".`);
  process.exit(0);
}
const me = mine[0]!.address;
console.log(`\n${name}: ${me}`);

const debts = await db.select().from(obligations).orderBy(obligations.id);
const line = (debt: (typeof debts)[number]) =>
  `  #${debt.id} ${nameOf(debt.debtor)} → ${nameOf(debt.creditor)}: ${units(debt.amount)} de ${units(debt.originalAmount)}` +
  `${debt.paid > 0n ? `, pagó ${units(debt.paid)}` : ""} (${debt.status})`;
const open = (debt: (typeof debts)[number]) => debt.status === "pending" || debt.status === "accepted";
console.log("Le deben:");
for (const debt of debts.filter((debt) => debt.creditor === me && open(debt))) console.log(line(debt));
console.log("Debe:");
for (const debt of debts.filter((debt) => debt.debtor === me && open(debt))) console.log(line(debt));
console.log("Entre los demás, abiertas:");
for (const debt of debts.filter((debt) => debt.creditor !== me && debt.debtor !== me && open(debt))) console.log(line(debt));
const closed = debts.filter((debt) => !open(debt));
console.log(`Cerradas: ${closed.length} (${closed.filter((debt) => debt.creditor === me || debt.debtor === me).length} suyas)`);

const settlements = await db.select().from(proposals).orderBy(desc(proposals.createdAt));
console.log(`\nPropuestas (${settlements.length}):`);
for (const proposal of settlements) {
  const ids = proposal.clearings.map((clearing) => `#${clearing.id}`).join(" ");
  console.log(`  ${proposal.status} ${ids} ${proposal.txHash?.slice(0, 8) ?? ""} ${proposal.createdAt.toISOString()}`);
}

const keys = (await db.select().from(credentials)).filter((key) => key.address === me);
console.log(`\nPasskeys de ${name}:`);
for (const key of keys) {
  console.log(`  "${key.label}" regla ${key.contextRuleId}${key.isPrimary ? ", la primera" : ""}${key.revokedAt ? ", revocada" : ""}`);
}
const invited = (await db.select().from(invitations)).filter((row) => row.address === me);
for (const row of invited) console.log(`  invitación "${row.label}" (${row.role}): ${row.status}`);

const limits = await db.select().from(rateLimits);
console.log(`\nLímites: ${limits.map((row) => `${row.key} ${row.count} hasta ${row.resetAt.toISOString().slice(11, 16)}Z`).join("; ")}`);
process.exit(0);
