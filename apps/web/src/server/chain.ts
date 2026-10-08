import "server-only";
import { Account, Address, BASE_FEE, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import type { ChainReader, StoredObligation } from "@nodus/indexer";
import { ACCOUNT_WASM_HASH, NETWORK_PASSPHRASE, RPC_URL, WEBAUTHN_VERIFIER, type PasskeySigner } from "@nodus/stellar";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "@/lib/config";

export const server = new rpc.Server(RPC_URL);

export const nodus = new NodusClient({
  contractId: NODUS_CONTRACT,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
});

/** A source for simulations, which need one but never check that it exists. */
const NOBODY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/** Simulates a contract call that nobody in particular sends. */
export async function simulate(contract: string, fn: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(new Account(NOBODY, "0"), { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.invokeContractFunction({ contract, function: fn, args }))
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
    throw new Error(`${fn} failed: ${"error" in simulation ? simulation.error : "no result"}`);
  }
  return { operation: tx.operations[0] as Operation.InvokeHostFunction, result: simulation.result };
}

const BALANCE_FRESHNESS_MS = 3_000;
const balances = new Map<string, { value: bigint; readAt: number }>();

/**
 * The token balance of a smart account, read straight from the token's
 * storage rather than by simulating a call, and kept for a few seconds.
 */
export async function tokenBalance(address: string, fresh = false): Promise<bigint> {
  const known = balances.get(address);
  if (!fresh && known && Date.now() - known.readAt < BALANCE_FRESHNESS_MS) return known.value;

  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(TOKEN_CONTRACT).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Balance"), Address.fromString(address).toScVal()]),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  const { entries } = await server.getLedgerEntries(key);
  const entry = entries[0]?.val.contractData().val();
  const value = entry ? ((scValToNative(entry) as { amount?: bigint }).amount ?? 0n) : 0n;
  balances.set(address, { value, readAt: Date.now() });
  return value;
}

/** Forgets the balances read so far, after something moved money. */
export function forgetBalances() {
  balances.clear();
}

/** A signer of a smart account's context rule. */
export type RuleSigner = { kind: "External"; verifier: string; keyData: Buffer } | { kind: "Delegated"; address: string };

export interface AccountRule {
  id: number;
  contextType: { kind: "Default" } | { kind: "CallContract"; contract: string } | { kind: "CreateContract" };
  name: string;
  signers: RuleSigner[];
  policies: string[];
  validUntil: number | undefined;
}

const RULE_FRESHNESS_MS = 60_000;
const rules = new Map<string, { rule: AccountRule | undefined; readAt: number }>();

/** One context rule of a smart account, as it is on chain. Undefined if there is no such rule or account. */
export async function accountRule(address: string, ruleId: number, fresh = false): Promise<AccountRule | undefined> {
  const cacheKey = `${address}:${ruleId}`;
  const known = rules.get(cacheKey);
  if (!fresh && known && Date.now() - known.readAt < RULE_FRESHNESS_MS) return known.rule;

  let rule: AccountRule | undefined;
  try {
    const { result } = await simulate(address, "get_context_rule", [xdr.ScVal.scvU32(ruleId)]);
    const raw = scValToNative(result.retval) as {
      id: number;
      context_type: [string, string?];
      name: string;
      signers: Array<[kind: string, first: string, keyData?: Buffer]>;
      policies: string[];
      valid_until: number | undefined;
    };
    rule = {
      id: raw.id,
      contextType:
        raw.context_type[0] === "CallContract"
          ? { kind: "CallContract", contract: raw.context_type[1]! }
          : raw.context_type[0] === "CreateContract"
            ? { kind: "CreateContract" }
            : { kind: "Default" },
      name: raw.name,
      signers: raw.signers.map((signer) =>
        signer[0] === "External"
          ? { kind: "External", verifier: signer[1], keyData: signer[2]! }
          : { kind: "Delegated", address: signer[1] },
      ),
      policies: raw.policies,
      validUntil: raw.valid_until ?? undefined,
    };
  } catch {
    // Not a smart account, no such rule, or the network failed: either way, not something to remember for long.
    rule = undefined;
  }
  rules.set(cacheKey, { rule, readAt: Date.now() });
  return rule;
}

/** Forgets what was read about an account's rules, after they changed. */
export function forgetRules(address: string) {
  for (const key of rules.keys()) if (key.startsWith(`${address}:`)) rules.delete(key);
}

const accounts = new Map<string, boolean>();

/** Whether `address` runs the smart account code this app creates accounts with. */
export async function isSmartAccount(address: string): Promise<boolean> {
  const known = accounts.get(address);
  if (known !== undefined) return known;
  let result = false;
  try {
    const instance = await server.getContractData(address, xdr.ScVal.scvLedgerKeyContractInstance());
    const executable = instance.val.contractData().val().instance().executable();
    result = executable.switch().name === "contractExecutableWasm" && executable.wasmHash().toString("hex") === ACCOUNT_WASM_HASH;
  } catch {
    result = false;
  }
  accounts.set(address, result);
  return result;
}

/** The WebAuthn signers of a rule, as the signature check needs them. */
export function passkeySigners(rule: AccountRule): PasskeySigner[] {
  return rule.signers.flatMap((signer) =>
    signer.kind === "External" && signer.verifier === WEBAUTHN_VERIFIER ? [{ verifier: signer.verifier, keyData: signer.keyData }] : [],
  );
}

/** Whether a rule may authorize anything the account can do: a `Default` rule with no policies. */
export function isOwnerRule(rule: AccountRule | undefined): rule is AccountRule {
  return rule !== undefined && rule.contextType.kind === "Default" && rule.policies.length === 0;
}

/** Whether `rule` names a passkey among its signers, by its public key (hex) followed by its credential id. */
export function namesPasskey(rule: AccountRule, publicKey: string, credentialId: string): boolean {
  const keyData = Buffer.concat([Buffer.from(publicKey, "hex"), Buffer.from(credentialId, "base64url")]);
  return rule.signers.some((signer) => signer.kind === "External" && signer.keyData.equals(keyData));
}

const LEDGER_FRESHNESS_MS = 3_000;
let ledger: { sequence: number; readAt: number } | undefined;

/** The latest ledger, at most a few seconds old. */
export async function latestLedger(): Promise<number> {
  if (!ledger || Date.now() - ledger.readAt > LEDGER_FRESHNESS_MS) {
    ledger = { sequence: (await server.getLatestLedger()).sequence, readAt: Date.now() };
  }
  return ledger.sequence;
}

const READ_BATCH = 100;

/** Reads the Nodus contract's storage directly, for squaring the database copy with it. */
export const chainReader: ChainReader = {
  async count() {
    const { result } = await simulate(NODUS_CONTRACT, "count", []);
    return scValToNative(result.retval) as bigint;
  },
  async obligations(ids) {
    const found = new Map<bigint, StoredObligation | null>();
    for (let at = 0; at < ids.length; at += READ_BATCH) {
      const batch = ids.slice(at, at + READ_BATCH);
      const keys = batch.map((id) =>
        xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: Address.fromString(NODUS_CONTRACT).toScAddress(),
            key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Obligation"), nativeToScVal(id, { type: "u64" })]),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        ),
      );
      const { entries } = await server.getLedgerEntries(...keys);
      for (const id of batch) found.set(id, null);
      for (const entry of entries) {
        const data = entry.val.contractData();
        const id = scValToNative(data.key().vec()![1]!) as bigint;
        const value = scValToNative(data.val()) as {
          debtor: string;
          creditor: string;
          amount: bigint;
          accepted: boolean;
          reference: Buffer | undefined;
          due: bigint | undefined;
        };
        found.set(id, {
          debtor: value.debtor,
          creditor: value.creditor,
          amount: value.amount,
          accepted: value.accepted,
          reference: value.reference ?? null,
          due: value.due ?? null,
        });
      }
    }
    return found;
  },
};
