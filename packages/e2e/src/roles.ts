/**
 * Drives the team flow of a running instance of the web app: the owner of a
 * business invites a clerk, the clerk creates a passkey on its own device,
 * the owner adds it to the account under a rule limited by the allowlist
 * policy, and the clerk enters and keeps the books without being able to
 * move money.
 *
 *   bun run roles                          # against http://localhost:3000
 *   bun run roles http://localhost:3001
 */
import { xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import type { InvitationView, SessionView } from "@nodus/api";
import { NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, defaultRuleIds } from "@nodus/stellar";
import { MemoryStorage, createCallContractContext, createWebAuthnSigner } from "smart-account-kit";
import { connectApp, type Business } from "./app.ts";
import { UNIT, log } from "./harness.ts";
import { SoftwarePasskey } from "./software-passkey.ts";

const app = new URL(process.argv[2] ?? "http://localhost:3000");
const { api, readState, join, login, newKit, owe } = await connectApp(app);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const { allowlistPolicy } = await api<{ allowlistPolicy: string | null }>("/api/health");
assert(allowlistPolicy, "the installation has the allowlist policy");

const run = Date.now().toString(36).slice(-4);
const owner = await join(`Almacén ${run}`);
const client = await join(`Cliente ${run}`);
const contract = (await readState(owner)).contract;
const nodus = new NodusClient({ contractId: contract, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE });

// --- The owner invites a clerk; the clerk creates a passkey on its own device.
const invitation = await api<InvitationView>("/api/invitations", { role: "clerk", label: "Contador" }, owner);
const clerkPasskey = new SoftwarePasskey(app.hostname, app.origin);
const { challenge } = await api<{ challenge: string }>("/api/session/challenge");
const registration = await clerkPasskey.startRegistration({ optionsJSON: { challenge } });
await api(`/api/invitations/${invitation.id}`, {
  registration: {
    id: registration.id,
    response: { clientDataJSON: registration.response.clientDataJSON, publicKey: registration.response.publicKey },
  },
});
const registered = await api<InvitationView>(`/api/invitations/${invitation.id}`);
assert(registered.status === "registered" && registered.publicKey && registered.credentialId, "the invitation holds the clerk's passkey");
log("Clerk registered a passkey");

// --- The owner adds it to the account under a rule that may only call the bookkeeping functions.
const signer = createWebAuthnSigner(
  WEBAUTHN_VERIFIER,
  Buffer.from(registered.publicKey, "hex"),
  Buffer.from(registered.credentialId, "base64url"),
);
const functions = ["register", "accept", "reject"];
const policies = new Map<string, unknown>([
  [
    allowlistPolicy,
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("functions"),
        val: xdr.ScVal.scvVec(functions.map((name) => xdr.ScVal.scvSymbol(name))),
      }),
    ]),
  ],
]);
const adding = await owner.kit.rules.add(createCallContractContext(contract), "contador", [signer], policies);
const added = await owner.kit.signAndSubmitAdmin(adding);
assert(added.success, `the rule is added: ${added.success ? "" : added.error.message}`);
const ruleId = adding.result.id;
await api(`/api/invitations/${invitation.id}`, { ruleId }, owner, "PATCH");
log(`Clerk added under rule ${ruleId}`);

// --- The clerk enters from its device: the session is a clerk's, and the kit connects as a secondary signer.
const memory = new MemoryStorage();
const clerk: Business = { name: "Contador", address: owner.address, kit: newKit(clerkPasskey, memory), passkey: clerkPasskey, cookie: "" };
const session: SessionView = await login(clerk);
assert(session.role === "clerk" && session.address === owner.address, "the clerk's session is limited and for the owner's account");
const primary = session.credentials.find((record) => record.isPrimary)!;
for (const record of session.credentials) {
  await memory.save({
    credentialId: record.credentialId,
    publicKey: new Uint8Array(Buffer.from(record.publicKey, "hex")),
    contractId: record.contractId,
    createdAt: Date.now(),
    isPrimary: record.isPrimary,
    contextRuleId: record.contextRuleId,
    associationVerified: !record.isPrimary,
    deploymentStatus: "deployed",
    birthWasmHash: record.birthWasmHash ?? primary.birthWasmHash,
    creationTransactionHash: record.creationTransactionHash ?? primary.creationTransactionHash,
    creationLedger: record.creationLedger ?? primary.creationLedger,
    birthConstructorArgsHash: record.birthConstructorArgsHash ?? primary.birthConstructorArgsHash,
  });
}
const connected = await clerk.kit.connectWallet({ credentialId: session.credentialId, contractId: session.address });
assert(connected?.contractId === owner.address, "the clerk's kit connects to the owner's account");
log("Clerk entered from its own device");

// --- The clerk registers a debt for the business, signing under its own rule.
const underRule = (entry: xdr.SorobanAuthorizationEntry) => defaultRuleIds(entry).map(() => ruleId);
const registering = await nodus.register({
  creditor: owner.address,
  debtor: client.address,
  amount: 10n * UNIT,
  reference: undefined,
  due: undefined,
});
const registeredDebt = await clerk.kit.signAndSubmit(registering, { resolveContextRuleIds: underRule });
assert(registeredDebt.success, `the clerk registers a debt: ${registeredDebt.success ? "" : registeredDebt.error.message}`);
log("Clerk registered a debt");

// --- The clerk cannot pay: the policy stops anything but the listed functions.
const debtId = await owe(owner, client, 5n * UNIT);
await api("/api/faucet", {}, owner);
const paying = await nodus.pay({ id: BigInt(debtId), amount: 1n * UNIT });
const paid = await clerk.kit
  .signAndSubmit(paying, { resolveContextRuleIds: underRule })
  .catch((error: Error) => ({ success: false as const, error }));
assert(!paid.success, "the clerk cannot pay");
log(`Refused as expected: ${paid.success ? "" : paid.error.message.slice(0, 120)}`);

// --- Nor sign a settlement: the API itself refuses a clerk.
const refused = await api("/api/proposals", { clearings: [{ id: debtId, amount: "1" }] }, clerk).then(
  () => undefined,
  (error: Error) => error,
);
assert(refused && /dueño/.test(refused.message), `the API refuses a clerk's signature (${refused?.message})`);
log(`Refused as expected: ${refused.message}`);

// --- The owner can take the key away.
const removing = await owner.kit.rules.remove(ruleId);
const removed = await owner.kit.signAndSubmitAdmin(removing);
assert(removed.success, "the owner removes the rule");
await api("/api/team", { credentialId: registered.credentialId }, owner, "DELETE");
const team = await api<{ credentials: Array<{ credentialId: string }> }>("/api/team", undefined, owner);
assert(!team.credentials.some((c) => c.credentialId === registered.credentialId), "the clerk's passkey is gone from the team");
log("Roles OK");
process.exit(0);
