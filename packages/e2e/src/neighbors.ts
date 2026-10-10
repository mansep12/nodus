/**
 * Gives a business two neighbours to try the app with, so that one person can
 * close a circle without playing every part. The neighbours are run by this
 * script: it sets up the debts, accepts what is registered against them and
 * signs every circle that someone has started signing.
 *
 *   bun run demo:neighbors <name or address of your business> [app url]
 *
 * Your business can be named by the name it gives itself in the app: the script
 * waits for it to exist, so it can start before the account is made. The
 * neighbours are made once and kept in pitch/out/demo/vecinos.json (test keys
 * only), and each run only registers the debts that are missing. Leaves you
 * two things to do in the app: accept the debt with the mill and register that
 * the carrier owes you 90. Stop it with Ctrl+C.
 *
 * When the scripts hold a passkey of your business (`llave.ts`), nothing is
 * left to do by hand but registering the 90: each run pays off what an earlier
 * attempt left over, accepts the debt with the mill and, once, gives the
 * business a network that looks like one: suppliers, clients, two circles
 * settled before and a direct payment.
 *
 * `CREAR=1` has the script make the business itself, for an instance nobody
 * enters by hand (the recording of `pitch/grabar.ts`). `MANOS_FUERA=1` leaves
 * the debts registered against the carrier for someone else to accept, on
 * camera; the neighbours still sign the circles.
 *
 * The neighbours wait a few seconds before signing (`PAUSA_FIRMAS`, in seconds,
 * 3 by default; 0 for none) and then sign one at a time, four seconds apart, so
 * that the app has time to show the signatures arriving. With the polling of the
 * script the first one lands 10 to 15 seconds after yours.
 */
import type { CircleView, ObligationView } from "@nodus/api";
import { connectApp, type Business, type DebtDetails } from "./app.ts";
import { UNIT, log, units } from "./harness.ts";
import { keptFor } from "./kept.ts";

const [who, url = "http://localhost:3000"] = process.argv.slice(2);
if (!who) throw new Error("Usage: bun run demo:neighbors <name or address of your business> [app url]");
const pause = Number(process.env.PAUSA_FIRMAS ?? 3) * 1000;
if (!Number.isFinite(pause) || pause < 0) throw new Error("PAUSA_FIRMAS must be a number of seconds.");
/** Time between one neighbour's signature and the next. */
const STAGGER = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000);

/**
 * More businesses around yours, so that the network looks like one: the suppliers register what you owe them and the clients accept what
 * you register against them. What stays owed never closes a circle, since none of them is left owing another.
 */
const SUPPLIERS: Array<[name: string, amount: bigint, details: DebtDetails]> = [
  ["Distribuidora Lácteos", 55n, { note: "Factura 4471", due: inDays(18) }],
  ["Envases Sur", 30n, { note: "Factura 0912", due: inDays(15) }],
  ["Agrícola Maipo", 75n, { note: "Factura 3310", due: inDays(9) }],
];
const CLIENTS = ["Cafetería Central", "Hotel Andino", "Restaurante Del Valle", "Colegio Los Aromos", "Minimarket Don Pepe"];

// The neighbours are kept between runs, so that the app only ever knows one of each.
const { mine, remember } = keptFor(url);
const { api, readState, join, keep, resume, enter, register, accept, pay, owe, sign, find } = await connectApp(new URL(url));

async function neighbor(slot: "mill" | "carrier", name: string) {
  const saved = mine[slot];
  if (!saved) {
    const business = await join(name);
    mine[slot] = await keep(business);
    remember();
    return business;
  }
  try {
    const business = await resume(saved);
    log(`${name}: ${business.address} (from the last run)`);
    return business;
  } catch (error) {
    throw new Error(
      `${name} could not come back (${error instanceof Error ? error.message : error}). If the app's database was wiped, wipe the saved neighbours too: bash pitch/demo.sh reiniciar`,
    );
  }
}
const mill = await neighbor("mill", "Molino Andes");
const carrier = await neighbor("carrier", "Fletes Ruta 5");
const neighbors = [mill, carrier];

/** The extra businesses, made once and kept like the neighbours. */
async function extra(name: string) {
  mine.extras ??= {};
  const saved = mine.extras[name];
  if (saved) return resume(saved);
  const business = await join(name);
  mine.extras[name] = await keep(business);
  remember();
  return business;
}
// One at a time: the relayer creates each account, and several at once trip over each other.
const suppliers: Business[] = [];
for (const [name] of SUPPLIERS) suppliers.push(await extra(name));
const clients: Business[] = [];
for (const name of CLIENTS) clients.push(await extra(name));

const isOpen = (obligation: ObligationView) => obligation.status === "pending" || obligation.status === "accepted";
/** The debts still open that `debtor` has with `creditor`, as either of them is shown them. */
const between = (obligations: ObligationView[], debtor: string, creditor: string) =>
  obligations.filter((obligation) => obligation.debtor === debtor && obligation.creditor === creditor && isOpen(obligation));

/** Test tokens for a business that is about to pay. */
async function fund(business: Business, atLeast: bigint) {
  if (BigInt((await readState(business)).balance ?? "0") < atLeast) await api("/api/faucet", {}, business);
}

/** The debtor pays what is left of a debt, accepting it first if it had not. */
async function payOff(debtor: Business, obligation: ObligationView) {
  if (obligation.status === "pending") await accept(debtor, BigInt(obligation.id));
  await fund(debtor, BigInt(obligation.amount));
  await pay(debtor, BigInt(obligation.id), BigInt(obligation.amount));
  log(`${debtor.name} paid off debt ${obligation.id} (${units(BigInt(obligation.amount))})`);
}

/**
 * Leaves `debtor` owing `creditor` one debt of `amount`, accepted, and nothing else: what an earlier attempt left over is paid directly,
 * so that the next circle is the one of the script.
 */
async function exactly(debtor: Business, creditor: Business, amount: bigint, details?: DebtDetails) {
  const open = between((await readState(debtor)).obligations, debtor.address, creditor.address);
  const kept = open.find((obligation) => BigInt(obligation.amount) === amount);
  for (const obligation of open) if (obligation !== kept) await payOff(debtor, obligation);
  if (!kept) await owe(debtor, creditor, amount, details);
  else if (kept.status === "pending") await accept(debtor, BigInt(kept.id));
}

/** Waits for the circle that `parties` close to be offered, has every one of them sign it and waits for it to settle. */
async function untie(parties: Business[], how: "full" | "netOnly") {
  const viewer = parties[0]!;
  const addresses = new Set(parties.map((party) => party.address));
  const settledBefore = (await readState(viewer)).settlementsTotal;
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
  for (const party of parties) await sign(option, party);
  for (let asked = 0; (await readState(viewer)).settlementsTotal === settledBefore; asked++) {
    if (asked > 40) throw new Error("The circle was signed by everyone but did not settle.");
    await sleep(3_000);
  }
  log(`Settled a circle of ${parties.length}: ${units(BigInt(option.cleared))} cancelled, ${units(BigInt(option.moved))} moved`);
}

/** Does `work` the first time only: what makes the network look lived in is not repeated on every run. */
async function once(step: string, work: () => Promise<void>) {
  if (mine.seeded?.includes(step)) return;
  log(`Once: ${step}`);
  await work();
  (mine.seeded ??= []).push(step);
  remember();
}

// Your business itself, when the scripts hold a passkey of it, or made it.
if (process.env.CREAR && !mine.key && !mine.bakery && !mine.you) {
  mine.bakery = await keep(await join(who));
  remember();
}
const bakery = mine.key ? await enter(mine.key) : mine.bakery ? await resume(mine.bakery) : undefined;
if (bakery) {
  mine.you = bakery.address;
  remember();
  log(`${bakery.name}: ${bakery.address} (the scripts sign for it, under rule ${bakery.ruleId ?? 0})`);
}

let you = /^C[A-Z2-7]{55}$/.test(who) ? who : mine.you;
if (!you) {
  log(`Waiting for a business called "${who}" to exist in the app.`);
  you = await find(mill, who);
  mine.you = you;
  remember();
  log(`${who}: ${you}`);
}

if (bakery) {
  // Whatever was registered against it and it had not accepted.
  for (const obligation of (await readState(bakery)).obligations) {
    if (obligation.debtor === bakery.address && obligation.status === "pending") await accept(bakery, BigInt(obligation.id));
  }
  // The three of the script: the bakery owes the mill 100, the mill owes the carrier 80, and the carrier owes nothing yet.
  for (const obligation of between((await readState(bakery)).obligations, carrier.address, bakery.address)) {
    await payOff(carrier, obligation);
  }
  // Each attempt is a new invoice of the mill.
  const invoices = (await readState(bakery)).obligations.filter((obligation) => obligation.creditor === mill.address).length;
  await exactly(bakery, mill, 100n * UNIT, { note: `Factura ${2291 + invoices}`, due: inDays(5) });
  await exactly(mill, carrier, 80n * UNIT);
  // In full, the bakery and the carrier pay a net of 10 each.
  await fund(bakery, 100n * UNIT);
  await fund(carrier, 100n * UNIT);

  const [dairy, packaging, farm] = suppliers as [Business, Business, Business];
  const [cafe, hotel, restaurant, school, minimarket] = clients as [Business, Business, Business, Business, Business];

  await once("a circle of three, settled in full", async () => {
    await exactly(bakery, farm, 75n * UNIT);
    await owe(farm, hotel, 60n * UNIT);
    await owe(hotel, bakery, 110n * UNIT, { note: "Factura 1164" });
    await fund(hotel, 100n * UNIT);
    await untie([bakery, farm, hotel], "full");
  });

  await once("a circle of four, settled without money", async () => {
    // What it owed for packaging is paid directly, and a larger order takes its place.
    await exactly(bakery, packaging, 80n * UNIT, { note: "Factura 0871" });
    await owe(packaging, minimarket, 80n * UNIT);
    await owe(minimarket, cafe, 80n * UNIT);
    await owe(cafe, bakery, 150n * UNIT, { note: "Factura 1171", due: inDays(3) });
    await untie([bakery, packaging, minimarket, cafe], "netOnly");
  });

  await once("what the clients owe", async () => {
    await owe(hotel, bakery, 180n * UNIT, { note: "Factura 1187", due: inDays(12) });
    const overdue = await owe(restaurant, bakery, 200n * UNIT, { note: "Factura 1179", due: inDays(-3) });
    await fund(restaurant, 100n * UNIT);
    await pay(restaurant, BigInt(overdue), 60n * UNIT);
    await owe(school, bakery, 95n * UNIT, { note: "Factura 1196", due: inDays(6) });
    await owe(minimarket, bakery, 45n * UNIT, { due: inDays(20) });
  });

  // What it owes its suppliers today.
  for (const [index, supplier] of suppliers.entries()) {
    const [, amount, details] = SUPPLIERS[index]!;
    if (between((await readState(bakery)).obligations, bakery.address, supplier.address).length === 0) {
      await owe(bakery, supplier, amount * UNIT, details);
    }
  }
  void dairy;
  // A circle settled in the last minutes is still shown first in the inbox, above the one to sign.
  const recent = (await readState(bakery)).circles.filter((circle) => circle.proposal?.status === "settled").length;
  if (recent > 0) log(`The inbox still shows ${recent} circle(s) just settled: they leave 15 minutes after their first signature.`);
  log("Ready: enter with your passkey and register that Fletes Ruta 5 owes you 90.");
} else {
  /** Whether a debt like this one is already on its way, so that a new run does not register it twice. */
  const owed = (obligations: ObligationView[], debtor: string, creditor: string, amount: bigint) =>
    between(obligations, debtor, creditor).some((obligation) => BigInt(obligation.amount) === amount);

  if (!owed((await readState(mill)).obligations, mill.address, carrier.address, 80n * UNIT)) await owe(mill, carrier, 80n * UNIT);
  // The carrier will owe a net of 10 each time the circle is settled in full.
  await fund(carrier, 100n * UNIT);
  // A debt of yours with the mill, for you to accept.
  if (!owed((await readState(mill)).obligations, you, mill.address, 100n * UNIT)) await register(you, mill, 100n * UNIT);
  // What you owe the suppliers, for you to accept.
  for (const [index, supplier] of suppliers.entries()) {
    const [, amount, details] = SUPPLIERS[index]!;
    if (!owed((await readState(supplier)).obligations, you, supplier.address, amount * UNIT)) {
      await register(you, supplier, amount * UNIT, details);
    }
  }
  log("Waiting: accept the debt with Molino Andes (if it is not accepted yet), and register that Fletes Ruta 5 owes you 90.");
}

/** The carrier's debts are accepted by someone else. */
const handsOff = Boolean(process.env.MANOS_FUERA);
const done = new Set<string>();
/** When each neighbour first saw a circle open, to sign after the pause. */
const seen = new Map<string, number>();
/** When a neighbour last signed each proposal, to let the next one wait. */
const lastSignature = new Map<string, number>();
let tick = 0;
for (;;) {
  // The clients only have debts to accept: they are looked at every other time.
  for (const neighbor of tick++ % 2 === 0 ? [...neighbors, ...clients] : neighbors) {
    const state = await readState(neighbor);
    for (const obligation of state.obligations) {
      if (handsOff && neighbor === carrier) break;
      if (obligation.debtor !== neighbor.address || obligation.status !== "pending" || done.has(obligation.id)) continue;
      done.add(obligation.id);
      await accept(neighbor, BigInt(obligation.id));
      log(`${neighbor.name} accepted debt ${obligation.id}`);
    }
    for (const circle of state.circles) {
      const mine = circle.parties.find((party) => party.address === neighbor.address);
      const key = `${circle.proposal?.id}:${neighbor.address}`;
      if (circle.proposal?.status !== "open" || !mine || mine.signed || done.has(key)) continue;
      const since = seen.get(key) ?? Date.now();
      seen.set(key, since);
      if (Date.now() - since < pause) continue;
      // One signature at a time, so that the app shows 2 of 3 before 3 of 3.
      const proposal = circle.proposal.id;
      if (Date.now() - (lastSignature.get(proposal) ?? 0) < STAGGER) continue;
      done.add(key);
      await sign(circle, neighbor).catch((error) => log(`${neighbor.name} could not sign: ${error.message}`));
      lastSignature.set(proposal, Date.now());
    }
  }
  await sleep(3_000);
}
