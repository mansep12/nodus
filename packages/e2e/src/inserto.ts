/**
 * For filming the other side of a debt. A business called "Panadería Sur"
 * registers that the business named here owes it 90, so that the one named here
 * (an account made by hand in the app) finds the debt in its inbox, ready to
 * accept with its own passkey. Waits for that account to exist, then ends.
 *
 *   bun run --filter @nodus/e2e inserto "Fletes Ruta 5" [app url]
 */
import { connectApp } from "./app.ts";
import { UNIT, log } from "./harness.ts";

const [debtorName, url = "http://localhost:3000"] = process.argv.slice(2);
if (!debtorName) throw new Error('Usage: bun run --filter @nodus/e2e inserto "<name of the business that will accept>" [app url]');

const { join, register, find } = await connectApp(new URL(url));
const bakery = await join("Panadería Sur");
log(`Waiting for a business called "${debtorName}" to exist in the app.`);
const debtor = await find(bakery, debtorName);
await register(debtor, bakery, 90n * UNIT);
log(`${bakery.name} registered that "${debtorName}" owes it 90: it is waiting in its inbox.`);
process.exit(0);
