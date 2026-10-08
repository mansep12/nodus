/**
 * The passkeys behind each smart account. Nothing here is trusted from the
 * browser: a passkey is recorded only if the account's own rule on chain
 * names it, and the account's creation facts only if the creation transaction
 * on the network bears them out.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { FeeBumpTransaction, StrKey, TransactionBuilder, hash, rpc, xdr } from "@stellar/stellar-sdk";
import { credentials, type Db } from "@nodus/db";
import { ACCOUNT_WASM_HASH, HORIZON_URL, NETWORK_PASSPHRASE } from "@nodus/stellar";
import { accountRule, namesPasskey, server } from "./chain";
import { getDb } from "./db";
import { UserError } from "./errors";

export type CredentialRecord = typeof credentials.$inferSelect;

/** The immutable facts of an account's creation, as the smart account kit keeps them. */
export interface Birth {
  wasmHash: string;
  transactionHash: string;
  ledger: number;
  constructorArgsHash: string;
}

export interface CredentialInput {
  address: string;
  credentialId: string;
  /** Uncompressed P-256 public key as hex. */
  publicKey: string;
  contextRuleId: number;
  isPrimary: boolean;
  label: string;
  birth?: Birth;
}

const HEX_64 = /^[0-9a-f]{64}$/;
const PUBLIC_KEY_HEX = /^04[0-9a-f]{128}$/;

/**
 * Records a passkey of `address`, after checking on chain that the given rule
 * of the account names it. The creation facts, when given, are checked
 * against the creation transaction itself.
 */
export async function registerCredential(input: CredentialInput): Promise<CredentialRecord> {
  if (!PUBLIC_KEY_HEX.test(input.publicKey)) throw new UserError("La llave pública no es válida.");
  if (!/^[A-Za-z0-9_-]{16,}$/.test(input.credentialId)) throw new UserError("La passkey no es válida.");

  const rule = await accountRule(input.address, input.contextRuleId, true);
  if (!rule) throw new UserError("La cuenta no tiene esa regla.");
  if (!namesPasskey(rule, input.publicKey, input.credentialId)) throw new UserError("Esa passkey no firma por esta cuenta.");

  // The passkey the account was born with signs under its first rule; nobody gets to claim otherwise.
  const isPrimary = input.contextRuleId === 0;
  const birth = input.birth && isPrimary ? await verifiedBirth(input.address, input.birth) : undefined;

  const db = await getDb();
  const [record] = await db
    .insert(credentials)
    .values({
      credentialId: input.credentialId,
      address: input.address,
      publicKey: input.publicKey,
      contextRuleId: input.contextRuleId,
      isPrimary,
      label: input.label.slice(0, 40),
      birthWasmHash: birth?.wasmHash,
      creationTransactionHash: birth?.transactionHash,
      creationLedger: birth?.ledger,
      birthConstructorArgsHash: birth?.constructorArgsHash,
    })
    .onConflictDoUpdate({
      target: credentials.credentialId,
      // The label stays as the account's owner set it: anyone may post a passkey the chain names.
      set: {
        address: input.address,
        publicKey: input.publicKey,
        contextRuleId: input.contextRuleId,
        isPrimary,
        revokedAt: null,
        ...(birth
          ? {
              birthWasmHash: birth.wasmHash,
              creationTransactionHash: birth.transactionHash,
              creationLedger: birth.ledger,
              birthConstructorArgsHash: birth.constructorArgsHash,
            }
          : {}),
      },
    })
    .returning();
  return record!;
}

/** The creation transaction of an account, from the RPC or, once that forgot it, from history. */
async function creationTransaction(txHash: string): Promise<{ ledger: number; envelopeXdr: string } | undefined> {
  const fromRpc = await server.getTransaction(txHash);
  if (fromRpc.status === rpc.Api.GetTransactionStatus.SUCCESS)
    return { ledger: fromRpc.ledger, envelopeXdr: fromRpc.envelopeXdr.toXDR("base64") };
  if (fromRpc.status === rpc.Api.GetTransactionStatus.FAILED) return undefined;
  const response = await fetch(`${HORIZON_URL}/transactions/${txHash}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { successful?: boolean; ledger?: number; envelope_xdr?: string };
  if (!body.successful || typeof body.ledger !== "number" || typeof body.envelope_xdr !== "string") return undefined;
  return { ledger: body.ledger, envelopeXdr: body.envelope_xdr };
}

/** `birth`, once the creation transaction has been seen to create `address` with the account code. */
async function verifiedBirth(address: string, birth: Birth): Promise<Birth> {
  const wrong = new UserError("Los datos de creación de la cuenta no coinciden con la red.");
  if (!HEX_64.test(birth.wasmHash) || !HEX_64.test(birth.transactionHash) || !HEX_64.test(birth.constructorArgsHash)) throw wrong;
  if (birth.wasmHash !== ACCOUNT_WASM_HASH) throw wrong;

  const transaction = await creationTransaction(birth.transactionHash);
  if (!transaction || transaction.ledger !== birth.ledger) throw wrong;
  const parsed = TransactionBuilder.fromXDR(transaction.envelopeXdr, NETWORK_PASSPHRASE);
  // The relayer wraps the creation in a fee bump; the hash the kit keeps is the outer one.
  if (parsed.hash().toString("hex") !== birth.transactionHash) throw wrong;
  const inner = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;

  const created = inner.operations.some((operation) => {
    if (operation.type !== "invokeHostFunction") return false;
    const func = operation.func;
    if (func.switch().name !== "hostFunctionTypeCreateContractV2") return false;
    const create = func.createContractV2();
    const executable = create.executable();
    if (executable.switch().name !== "contractExecutableWasm" || executable.wasmHash().toString("hex") !== birth.wasmHash) return false;
    const preimage = create.contractIdPreimage();
    if (preimage.switch().name !== "contractIdPreimageFromAddress") return false;
    const id = hash(
      xdr.HashIdPreimage.envelopeTypeContractId(
        new xdr.HashIdPreimageContractId({ networkId: hash(Buffer.from(NETWORK_PASSPHRASE)), contractIdPreimage: preimage }),
      ).toXDR(),
    );
    if (StrKey.encodeContract(id) !== address) return false;
    const argsHash = createHash("sha256")
      .update(xdr.ScVal.scvVec([...create.constructorArgs()]).toXDR())
      .digest("hex");
    return argsHash === birth.constructorArgsHash;
  });
  if (!created) throw wrong;
  return birth;
}

/** The passkeys that currently answer for `address`. */
export async function credentialsOf(address: string): Promise<CredentialRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(credentials)
    .where(and(eq(credentials.address, address), isNull(credentials.revokedAt)));
}

export async function findCredential(credentialId: string): Promise<CredentialRecord | undefined> {
  const db = await getDb();
  const [record] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.credentialId, credentialId), isNull(credentials.revokedAt)));
  return record;
}

/** Marks a passkey as no longer answering for its account, once the chain says so. */
export async function revokeCredential(db: Db, credentialId: string): Promise<void> {
  await db.update(credentials).set({ revokedAt: new Date() }).where(eq(credentials.credentialId, credentialId));
}

/** What the smart account kit needs to connect with `record` in a browser that never saw the account. */
export function kitRecord(record: CredentialRecord) {
  return {
    credentialId: record.credentialId,
    publicKey: record.publicKey,
    contractId: record.address,
    contextRuleId: record.contextRuleId,
    isPrimary: record.isPrimary,
    label: record.label,
    birthWasmHash: record.birthWasmHash ?? undefined,
    creationTransactionHash: record.creationTransactionHash ?? undefined,
    creationLedger: record.creationLedger ?? undefined,
    birthConstructorArgsHash: record.birthConstructorArgsHash ?? undefined,
  };
}
