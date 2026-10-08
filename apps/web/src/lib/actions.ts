/** What a business does in Nodus. Each action is signed with its passkey. */
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import { NETWORK_PASSPHRASE, RPC_URL, entryAddress, ruleIdsUnder } from "@nodus/stellar";
import type { SmartAccountKit } from "smart-account-kit";
import { post } from "./api";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "./config";
import { getKit } from "./kit";
import type { CircleView, SigningRequest } from "./types";

let client: NodusClient | undefined;
const nodus = () => (client ??= new NodusClient({ contractId: NODUS_CONTRACT, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }));

/** The account's rule the session signs under: 0 for the owner, another for a clerk. */
let signingRule = 0;

export function configureSigner({ ruleId }: { ruleId: number }) {
  signingRule = ruleId;
}

/** Every invocation of an entry is signed under the session's rule. */
const ruleIds = (entry: xdr.SorobanAuthorizationEntry) => ruleIdsUnder(entry, signingRule);

const CONTRACT_ERRORS: Record<number, string> = {
  1: "El monto no es válido.",
  2: "Un negocio no puede deberse a sí mismo.",
  3: "Esa deuda ya no existe.",
  4: "Esa deuda ya estaba aceptada.",
  5: "Esa deuda todavía no ha sido aceptada.",
  6: "El círculo no tiene deudas.",
  7: "Las deudas del círculo no están en orden.",
  8: "El monto supera lo que se debe.",
  3302: "Tu llave no tiene permiso para hacer esto. Pídeselo al dueño de la cuenta.",
};

/** Says what went wrong in terms of what the person was doing. */
export function explain(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (
    name === "NotAllowedError" ||
    name === "WebAuthnError" ||
    /NotAllowedError|not allowed|timed out|cancell?ed|AbortError/.test(message)
  ) {
    return "No se firmó: cancelaste o tu dispositivo no lo permitió.";
  }
  if (name === "WalletProvenanceError" || name === "WalletOwnershipError" || /birth|provenance|ownership/i.test(message)) {
    return "No pudimos comprobar que esta passkey controla la cuenta. Entra de nuevo; si sigue pasando, entra desde el navegador donde la creaste.";
  }
  const code = /Error\(Contract, #(\d+)\)/.exec(message)?.[1];
  if (code && CONTRACT_ERRORS[Number(code)]) return CONTRACT_ERRORS[Number(code)]!;
  if (/Error\(Auth, InvalidAction\)/.test(message))
    return "La cuenta rechazó la firma. Si usas una llave limitada, esto necesita al dueño.";
  if (/insufficient|balance|underfunded/i.test(message)) return "No alcanza el saldo para pagar.";
  if (/relayer|HTTP 5\d\d|fetch failed|NetworkError/i.test(message)) return "La red no respondió. Intenta de nuevo en un momento.";
  if (/^[A-Za-z]/.test(message) && !/[áéíóúñ¿¡]/.test(message)) return "Algo falló al firmar o enviar. Intenta de nuevo.";
  return message;
}

async function send(transaction: Parameters<SmartAccountKit["signAndSubmit"]>[0]) {
  const result = await getKit().signAndSubmit(transaction, { resolveContextRuleIds: ruleIds });
  if (!result.success) throw result.error;
}

export interface DebtDetails {
  /** The hash of the document behind the debt, 32 bytes. */
  reference?: Uint8Array;
  /** When it falls due. */
  due?: Date;
}

/** The creditor records that `debtor` owes it `amount`. Returns the id the debt got. */
export async function registerDebt(creditor: string, debtor: string, amount: bigint, details: DebtDetails = {}): Promise<bigint> {
  const registration = await nodus().register({
    creditor,
    debtor,
    amount,
    reference: details.reference ? Buffer.from(details.reference) : undefined,
    due: details.due ? BigInt(Math.floor(details.due.getTime() / 1000)) : undefined,
  });
  const id = registration.result.unwrap();
  await send(registration);
  return id;
}

/** The debtor acknowledges a debt, which lets it take part in settlements. */
export async function acceptDebt(id: bigint) {
  await send(await nodus().accept({ id }));
}

/** The debtor refuses a debt it has not accepted. */
export async function rejectDebt(id: bigint) {
  await send(await nodus().reject({ id }));
}

/** The creditor withdraws a debt. */
export async function cancelDebt(id: bigint) {
  await send(await nodus().cancel({ id }));
}

/** The debtor pays `amount` of an accepted debt straight to the creditor. */
export async function payDebt(id: bigint, amount: bigint) {
  await send(await nodus().pay({ id, amount }));
}

/** Signs this account's part of a circle. When the last party signs, the circle is settled. */
export async function signCircle(circle: CircleView, address: string) {
  const request = await post<SigningRequest>("/api/proposals", { clearings: circle.clearings });
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64");
  assertMatches(entry, circle, address);
  const signed = await getKit().signAuthEntry(entry, {
    contextRuleIds: ruleIds(entry),
    expiration: request.expirationLedger,
  });
  await post(`/api/proposals/${request.proposalId}/signatures`, { signedEntry: signed.toXDR("base64") });
}

function contractCall(invocation: xdr.SorobanAuthorizedInvocation) {
  const fn = invocation.function();
  if (fn.switch().name !== "sorobanAuthorizedFunctionTypeContractFn") return undefined;
  const call = fn.contractFn();
  return {
    contract: Address.fromScAddress(call.contractAddress()).toString(),
    name: call.functionName().toString(),
    args: call.args().map((arg) => scValToNative(arg) as unknown),
  };
}

/**
 * Refuses to sign anything but the settlement on screen: exactly its
 * clearings, paying at most the net shown. The server that relays the request
 * is therefore not trusted with what gets signed.
 */
export function assertMatches(entry: xdr.SorobanAuthorizationEntry, circle: CircleView, address: string) {
  const mismatch = new Error("La solicitud de firma no coincide con el círculo en pantalla.");
  const root = entry.rootInvocation();
  const settle = contractCall(root);
  if (entryAddress(entry) !== address || settle?.contract !== NODUS_CONTRACT || settle.name !== "settle") throw mismatch;

  const clearings = settle.args[0] as Array<{ id: bigint; amount: bigint }>;
  const same =
    clearings.length === circle.clearings.length &&
    clearings.every((c, i) => `${c.id}` === circle.clearings[i]!.id && `${c.amount}` === circle.clearings[i]!.amount);
  if (!same) throw mismatch;

  const net = BigInt(circle.parties.find((party) => party.address === address)?.net ?? "0");
  const payments = root.subInvocations();
  if (net >= 0n) {
    if (payments.length > 0) throw mismatch;
    return;
  }
  const payment = payments.length === 1 && payments[0]!.subInvocations().length === 0 ? contractCall(payments[0]!) : undefined;
  const [from, to, amount] = payment?.args ?? [];
  const paysTheNet =
    payment?.contract === TOKEN_CONTRACT && payment.name === "transfer" && from === address && to === NODUS_CONTRACT && amount === -net;
  if (!paysTheNet) throw mismatch;
}
