/**
 * Gives a business two neighbours to try the app with, so that one person can
 * close a circle without playing every part. The neighbours are run by this
 * script: it sets up the debts, accepts what is registered against them and
 * signs every circle that someone has started signing.
 *
 *   bun run neighbors <address of your business> [app url]
 *
 * Leaves you two things to do in the app: accept the debt with the mill and
 * register that the carrier owes you 90. Stop it with Ctrl+C.
 */
import { connectApp } from "./app.ts";
import { UNIT, log } from "./harness.ts";

const [you, url = "http://localhost:3000"] = process.argv.slice(2);
if (!you) throw new Error("Usage: bun run neighbors <address of your business> [app url]");

const { api, readState, join, register, accept, owe, sign } = await connectApp(new URL(url));
const mill = await join("Molino Andes");
const carrier = await join("Fletes Ruta 5");
const neighbors = [mill, carrier];

await owe(mill, carrier, 80n * UNIT);
// A debt of yours with the mill, for you to accept.
await register(you, mill, 100n * UNIT);
// The carrier will owe a net of 10 when the circle is settled in full.
await api("/api/faucet", { address: carrier.address });
log("Waiting: accept the debt with Molino Andes, and register that Fletes Ruta 5 owes you 90.");

const done = new Set<string>();
for (;;) {
  const state = await readState();
  for (const neighbor of neighbors) {
    for (const obligation of state.obligations) {
      if (obligation.debtor !== neighbor.address || obligation.status !== "pending" || done.has(obligation.id)) continue;
      done.add(obligation.id);
      await accept(neighbor, BigInt(obligation.id));
      log(`${neighbor.name} accepted debt ${obligation.id}`);
    }
    for (const circle of state.circles) {
      const mine = circle.parties.find((party) => party.address === neighbor.address);
      const key = `${circle.proposal?.id}:${neighbor.address}`;
      if (circle.proposal?.status !== "open" || !mine || mine.signed || done.has(key)) continue;
      done.add(key);
      await sign(circle, neighbor).catch((error) => log(`${neighbor.name} could not sign: ${error.message}`));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}
