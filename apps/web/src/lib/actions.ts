/** What a business does in Nodus. Each action is signed with its passkey. */
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Client as NodusClient } from "@nodus/contract-client";
import { NETWORK_PASSPHRASE, RPC_URL, defaultRuleIds, entryAddress } from "@nodus/stellar";
import type { SmartAccountKit } from "smart-account-kit";
import { post } from "./api";
import { NODUS_CONTRACT, TOKEN_CONTRACT } from "./config";
import { getKit } from "./kit";
import type { CircleView, SigningRequest } from "./types";

let client: NodusClient | undefined;
const nodus = () =>
  (client ??= new NodusClient({ contractId: NODUS_CONTRACT, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE }));

const CONTRACT_ERRORS: Record<number, string> = {
  1: "El monto no es válido.",
  2: "Un negocio no puede deberse a sí mismo.",
  3: "Esa deuda ya no existe.",
  4: "Esa deuda ya estaba aceptada.",
  5: "Esa deuda todavía no ha sido aceptada.",
  8: "El monto supera lo que se debe.",
};

/** Says what went wrong in terms of what the person was doing. */
export function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/NotAllowedError|not allowed|timed out|cancel/i.test(message)) return "No se firmó: cancelaste o tu dispositivo no lo permitió.";
  const code = /Error\(Contract, #(\d+)\)/.exec(message)?.[1];
  if (code && CONTRACT_ERRORS[Number(code)]) return CONTRACT_ERRORS[Number(code)]!;
  return message;
}

async function send(transaction: Parameters<SmartAccountKit["signAndSubmit"]>[0]) {
  const result = await getKit().signAndSubmit(transaction, { resolveContextRuleIds: defaultRuleIds });
  if (!result.success) throw result.error;
}

/** The creditor records that `debtor` owes it `amount`. */
export async function registerDebt(creditor: string, debtor: string, amount: bigint) {
  await send(await nodus().register({ creditor, debtor, amount }));
}

/** The debtor acknowledges a debt, which lets it take part in settlements. */
export async function acceptDebt(id: bigint) {
  await send(await nodus().accept({ id }));
}

/** The creditor withdraws a debt. */
export async function cancelDebt(id: bigint) {
  await send(await nodus().cancel({ id }));
}

/** Signs this account's part of a circle. When the last party signs, the circle is settled. */
export async function signCircle(circle: CircleView, address: string) {
  const request = await post<SigningRequest>("/api/proposals", { clearings: circle.clearings, address });
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(request.entry, "base64");
  assertMatches(entry, circle, address);
  const signed = await getKit().signAuthEntry(entry, {
    contextRuleIds: defaultRuleIds(entry),
    expiration: request.expirationLedger,
  });
  await post(`/api/proposals/${request.proposalId}/signatures`, { address, signedEntry: signed.toXDR("base64") });
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
function assertMatches(entry: xdr.SorobanAuthorizationEntry, circle: CircleView, address: string) {
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
    payment?.contract === TOKEN_CONTRACT &&
    payment.name === "transfer" &&
    from === address &&
    to === NODUS_CONTRACT &&
    amount === -net;
  if (!paysTheNet) throw mismatch;
}
