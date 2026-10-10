/**
 * Makes example worlds for an installation of the app: networks of made-up
 * businesses that a visitor can be handed to try the app alone. Each world is
 * the story of the pitch: a bakery with its suppliers and clients, two circles
 * settled before, a direct payment, and a circle of three ready to be signed
 * with the mill and the carrier.
 *
 *   CRON_SECRET=… bun run example:worlds <how many> [app url]
 *
 * Everything is done as the businesses would from their browsers, on testnet,
 * so a world takes a few minutes. When one is finished its keys are handed to
 * the app, which from then on answers for the neighbours and gives the bakery
 * to whoever asks to try. The secret is the one of the installation's
 * scheduler: it lets the script through the rate limits and is what the app
 * asks for before taking a world in. A step that fails is tried again; a
 * world that still fails halfway is left behind, its accounts are taken out
 * of the directory and another one is started.
 */
import type { CircleView } from "@nodus/api";
import { connectApp, type Business, type DebtDetails } from "./app.ts";
import { UNIT, log, units } from "./harness.ts";

const [wanted = "1", url = "http://localhost:3000"] = process.argv.slice(2);
const count = Number(wanted);
if (!Number.isInteger(count) || count < 1) throw new Error("Usage: bun run example:worlds <how many> [app url]");
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is not set: it is what the app asks for before taking a world in.");

const app = new URL(url);
// Every request to the app says it comes from the installation's own script, including those the smart account kit makes to the relayer.
const plainFetch = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const target = new URL(input instanceof Request ? input.url : input.toString());
  if (target.origin !== app.origin) return plainFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-nodus-operator", secret);
  return plainFetch(input, { ...init, headers });
}) as typeof fetch;

const { api, readState, join, keep, register, accept, pay, sign } = await connectApp(app);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000);

/** Waits for the circle that `parties` close to be offered, has every one of them sign it and waits for it to settle. */
async function untie(parties: Business[], how: "full" | "netOnly") {
  const viewer = parties[0]!;
  const addresses = new Set(parties.map((party) => party.address));
  let circle: CircleView | undefined;
  for (let asked = 0; !circle; asked++) {
    if (asked > 40) throw new Error(`The circle of ${parties.map((party) => party.name).join(", ")} did not show up.`);
    await sleep(3_000);
    circle = (await readState(viewer)).circles.find(
      (candidate) =>
        candidate.proposal === undefined &&
        candidate.parties.length === parties.length &&
        candidate.parties.every((party) => !party.known || addresses.has(party.address)),
    );
  }
  const option = how === "netOnly" ? circle.netOnly : circle;
  if (!option) throw new Error("That circle cannot be settled without moving money.");
  const settledBefore = (await readState(viewer)).settlementsTotal;
  for (const party of parties) await sign(option, party);
  for (let asked = 0; (await readState(viewer)).settlementsTotal === settledBefore; asked++) {
    if (asked > 40) throw new Error("The circle was signed by everyone but did not settle.");
    await sleep(3_000);
  }
  log(`Settled a circle of ${parties.length}: ${units(BigInt(option.cleared))} cancelled, ${units(BigInt(option.moved))} moved`);
}

/**
 * Does a step again when it fails: a debt takes the next number of the
 * contract, so one registered in the same moment as someone else's is refused
 * by the network, and the network itself drops a transaction now and then.
 */
async function insist<T>(what: string, step: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (error) {
      if (attempt >= 4) throw error;
      log(`${what} failed (${error instanceof Error ? error.message.slice(0, 120) : error}); trying again.`);
      await sleep(4_000 * attempt);
    }
  }
}

async function makeWorld(made: Business[]) {
  // One at a time: the relayer creates each account, and several at once trip over each other.
  const open = async (name: string) => {
    const business = await join(name);
    made.push(business);
    return business;
  };
  const bakery = await open("Panadería Sur");
  const mill = await open("Molino Andes");
  const carrier = await open("Fletes Ruta 5");
  const dairy = await open("Distribuidora Lácteos");
  const packaging = await open("Envases Sur");
  const farm = await open("Agrícola Maipo");
  const cafe = await open("Cafetería Central");
  const hotel = await open("Hotel Andino");
  const restaurant = await open("Restaurante Del Valle");
  const school = await open("Colegio Los Aromos");
  const minimarket = await open("Minimarket Don Pepe");

  /** The debtor owes the creditor `amount`, registered and accepted. */
  async function debt(debtor: Business, creditor: Business, amount: bigint, details?: DebtDetails): Promise<string> {
    const id = await insist(`Registering what ${debtor.name} owes ${creditor.name}`, () =>
      register(debtor.address, creditor, amount * UNIT, details),
    );
    await insist(`Accepting debt ${id}`, async () => {
      // An attempt that seemed to fail may have gone through.
      const known = (await readState(debtor)).obligations.find((obligation) => obligation.id === id.toString());
      if (known?.status !== "accepted") await accept(debtor, id);
    });
    log(`${debtor.name} owes ${creditor.name} ${amount} (obligation ${id})`);
    return id.toString();
  }
  // Whoever pays a net, or a debt directly, needs test tokens to do it with.
  for (const payer of [bakery, carrier, hotel, restaurant]) await insist(`Funding ${payer.name}`, () => api("/api/faucet", {}, payer));

  // A circle of three settled in full: the bakery receives a net of 35 and the hotel pays 50.
  await debt(bakery, farm, 75n);
  await debt(farm, hotel, 60n);
  await debt(hotel, bakery, 110n, { note: "Factura 1164" });
  await untie([bakery, farm, hotel], "full");

  // A circle of four settled without money: 80 less on each debt, and the café still owes 70.
  await debt(bakery, packaging, 80n, { note: "Factura 0871" });
  await debt(packaging, minimarket, 80n);
  await debt(minimarket, cafe, 80n);
  await debt(cafe, bakery, 150n, { note: "Factura 1171", due: inDays(9) });
  await untie([bakery, packaging, minimarket, cafe], "netOnly");

  // What its clients owe it, one of them late and partly paid.
  await debt(hotel, bakery, 180n, { note: "Factura 1187", due: inDays(12) });
  const overdue = await debt(restaurant, bakery, 200n, { note: "Factura 1179", due: inDays(-3) });
  await insist("The restaurant's payment", () => pay(restaurant, BigInt(overdue), 60n * UNIT));
  await debt(school, bakery, 95n, { note: "Factura 1196", due: inDays(8) });
  await debt(minimarket, bakery, 45n, { due: inDays(20) });

  // What it owes its suppliers.
  await debt(bakery, dairy, 55n, { note: "Factura 4471", due: inDays(18) });
  await debt(bakery, packaging, 30n, { note: "Factura 0912", due: inDays(15) });
  await debt(bakery, farm, 75n, { note: "Factura 3310", due: inDays(10) });

  // The circle left for the visitor to sign: 270 in debts, settled by moving 20.
  await debt(bakery, mill, 100n, { note: "Factura 2291", due: inDays(14) });
  await debt(mill, carrier, 80n);
  await debt(carrier, bakery, 90n, { note: "Factura 1203", due: inDays(7) });

  const kept = async (business: Business, part?: string) => {
    const saved = await keep(business);
    return { address: saved.address, part, passkey: saved.passkey };
  };
  const neighbors = [await kept(mill, "mill"), await kept(carrier, "carrier")];
  for (const other of [dairy, packaging, farm, cafe, hotel, restaurant, school, minimarket]) neighbors.push(await kept(other));
  const { id } = await api<{ id: string }>("/api/example/worlds", { business: await kept(bakery), neighbors });
  return { id, bakery: bakery.address };
}

let made = 0;
let failedInARow = 0;
while (made < count) {
  const started = Date.now();
  const accounts: Business[] = [];
  try {
    const world = await makeWorld(accounts);
    made++;
    failedInARow = 0;
    log(`World ${made} of ${count} is ready in ${Math.round((Date.now() - started) / 1000)} s: ${world.id} (${world.bakery})`);
  } catch (error) {
    log(`A world failed and is left behind: ${error instanceof Error ? error.message : error}`);
    // Nobody answers for its businesses: they should not be found in the directory.
    await api("/api/example/worlds", { addresses: accounts.map((account) => account.address) }, null, "DELETE").catch(() => undefined);
    if (++failedInARow >= 3) throw new Error("Three worlds failed in a row; stopping.");
  }
}
const waiting = await api<{ waiting: number; claimed: number }>("/api/example/worlds");
log(`Done. The app has ${waiting.waiting} world(s) waiting for a visitor and ${waiting.claimed} handed out.`);
process.exit(0);
