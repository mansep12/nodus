/**
 * Drives a running instance of the web app the way three businesses would
 * from their browsers: through its API and its relayer, signing with passkeys.
 * Settles one circle without moving money and another paying the nets.
 *
 *   bun run web                          # against http://localhost:3000
 *   bun run web http://localhost:3001
 */
import { xdr } from "@stellar/stellar-sdk";
import { addressCredentials } from "@nodus/stellar";
import { MemoryStorage } from "smart-account-kit";
import type { CircleView, SigningRequest } from "@nodus/api";
import { connectApp, type Business } from "./app.ts";
import { UNIT, log } from "./harness.ts";

const { api, readState, join, login, owe, pay, sign, newKit } = await connectApp(new URL(process.argv[2] ?? "http://localhost:3000"));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** Checks that the app turns something down, and says why in the words expected. */
async function refuses(action: () => Promise<unknown>, reason: RegExp, what: string) {
  const error = await action().then(
    () => undefined,
    (thrown: Error) => thrown,
  );
  assert(error && reason.test(error.message), `${what} (got: ${error?.message ?? "no refusal"})`);
  log(`Refused as expected: ${error.message}`);
}

const run = Date.now().toString(36).slice(-4);
const bakery = await join(`Panadería ${run}`);
const mill = await join(`Molino ${run}`);
const carrier = await join(`Transportes ${run}`);
const businesses = [bakery, mill, carrier];
const ours = new Set(businesses.map((business) => business.address));

/** The circle among our three businesses that is still to be settled, if any, as the bakery sees it. */
async function openCircle(): Promise<CircleView | undefined> {
  const { circles } = await readState(bakery);
  return circles.find((circle) => circle.proposal?.status !== "settled" && circle.parties.every((party) => ours.has(party.address)));
}
/** A debt as one of its parties sees it: nobody else is shown it. */
const amountOf = async (id: string, who: Business = bakery) =>
  (await readState(who)).obligations.find((obligation) => obligation.id === id)!;
const of = (amount: bigint) => (amount * UNIT).toString();

// --- A circle settled without moving money: nobody needs to hold the token.
const ab = await owe(bakery, mill, 100n * UNIT);
const bc = await owe(mill, carrier, 80n * UNIT);
const ca = await owe(carrier, bakery, 90n * UNIT);

let circle = await openCircle();
assert(circle, "the circle shows up");
assert(circle.cleared === of(270n) && circle.moved === of(20n), "in full it cancels 270 moving 20");
assert(circle.netOnly?.cleared === of(240n) && circle.netOnly.moved === "0", "without money it cancels 240");

// Everyone in a circle of three deals with the other two, so all are named; the API never hands out strangers.
assert(
  circle.parties.every((party) => party.known && ours.has(party.address)),
  "the bakery knows its two neighbours",
);
assert(
  circle.edges.every((edge) => (edge.from === bakery.address || edge.to === bakery.address ? edge.amount !== null : edge.amount === null)),
  "only the debts that touch the viewer come with an amount",
);

await refuses(
  () => api("/api/proposals", { clearings: [{ id: ab, amount: "1" }], address: bakery.address }, bakery),
  /ya no está disponible/,
  "a settlement the solver did not propose cannot be started",
);
await refuses(() => api("/api/state"), /passkey/, "the state needs a session");
await refuses(
  () => api("/api/businesses", { name: "Impostor" }, { cookie: "nodus_session=forged" }),
  /passkey/,
  "a forged session cookie is not a session",
);

// Someone signs in the mill's name with something that is not its passkey's signature.
const asked = await api<SigningRequest>("/api/proposals", { clearings: circle.netOnly.clearings }, mill);
const forged = xdr.SorobanAuthorizationEntry.fromXDR(asked.entry, "base64");
addressCredentials(forged).signatureExpirationLedger(asked.expirationLedger);
addressCredentials(forged).signature(
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signers"), val: xdr.ScVal.scvMap([]) }),
  ]),
);
await refuses(
  () => api(`/api/proposals/${asked.proposalId}/signatures`, { signedEntry: forged.toXDR("base64") }, mill),
  /no es válida/,
  "a signature that is not the account's passkey's is not accepted",
);

for (const business of businesses) await sign(circle.netOnly, business);

let state = await readState(bakery);
assert(state.settlements[0]?.circle.cleared === of(240n) && state.settlements[0].circle.moved === "0", "it settled 240 moving nothing");
assert(state.settlementsTotal === 1 && state.network.settlements >= 1, "the settlement counts for the business and for the network");
assert((await amountOf(ab)).amount === of(20n) && (await amountOf(ab)).status === "accepted", "20 are still owed to the mill");
assert((await amountOf(bc, mill)).status === "settled", "the debt to the carrier is gone");
assert(
  (await readState(bakery)).obligations.every((o) => o.id !== bc),
  "the bakery is not shown a debt between the other two",
);
assert((await amountOf(ca)).amount === of(10n), "10 are still owed to the bakery");
assert((await openCircle()) === undefined, "what is left does not close a circle");
log(`Settled without money: ${state.settlements[0].txHash}`);

// --- A circle settled in full: the net payers need funds, and get told so.
const bc2 = await owe(mill, carrier, 30n * UNIT);
circle = await openCircle();
assert(circle, "the new debt closes the circle again");
assert(circle.cleared === of(60n) && circle.moved === of(20n), "in full it cancels 60 moving 20");

await refuses(
  () => sign(circle!, bakery),
  /otro negocio del círculo todavía no le alcanza/,
  "a party that cannot pay its net stops the proposal",
);
await refuses(() => sign(circle!, mill), /Necesitas 10 USDC/, "the asker is told its own shortfall");

for (const payer of [bakery, mill]) await api("/api/faucet", {}, payer);
for (const business of businesses) await sign(circle, business);

state = await readState(bakery);
assert(state.settlements[0]?.circle.cleared === of(60n) && state.settlements[0].circle.moved === of(20n), "it settled 60 moving 20");
for (const [id, who] of [
  [ab, bakery],
  [ca, bakery],
  [bc2, mill],
] as const) {
  assert((await amountOf(id, who)).status === "settled", `obligation ${id} is settled`);
}
const balances = await Promise.all(businesses.map(async (business) => (await readState(business)).balance));
assert(balances.join() === [of(990n), of(990n), of(20n)].join(), `balances after paying the nets (got ${balances.join()})`);
log(`Settled in full: ${state.settlements[0].txHash}`);

// --- What a settlement leaves owed can be paid directly, and the books say so.
const leftover = await owe(mill, bakery, 50n * UNIT);
await pay(mill, BigInt(leftover), 20n * UNIT);
state = await readState(bakery);
const paidDebt = state.obligations.find((obligation) => obligation.id === leftover)!;
assert(paidDebt.amount === of(30n) && paidDebt.paid === of(20n) && paidDebt.status === "accepted", "a direct payment reduces the debt");

// --- Entering again from a browser that never saw the account: the API seeds the kit.
const memory = new MemoryStorage();
const elsewhere = newKit(carrier.passkey, memory);
const view = await login(carrier);
for (const record of view.credentials) {
  await memory.save({
    credentialId: record.credentialId,
    publicKey: new Uint8Array(Buffer.from(record.publicKey, "hex")),
    contractId: record.contractId,
    createdAt: Date.now(),
    isPrimary: record.isPrimary,
    contextRuleId: record.contextRuleId,
    deploymentStatus: "deployed",
    birthWasmHash: record.birthWasmHash,
    creationTransactionHash: record.creationTransactionHash,
    creationLedger: record.creationLedger,
    birthConstructorArgsHash: record.birthConstructorArgsHash,
  });
}
const connected = await elsewhere.connectWallet({ credentialId: view.credentialId, contractId: view.address });
assert(connected?.contractId === carrier.address, "the account connects on a new device from the records the API keeps");
log("Entered from a new device");

log("Web OK");
process.exit(0);
