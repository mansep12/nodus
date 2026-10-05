import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { UserError } from "./errors";

/** The JSON body of a request, as an object. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new UserError("La solicitud no es válida.");
  return parsed as Record<string, unknown>;
}

/** A smart account address. */
export function account(value: unknown): string {
  if (typeof value !== "string" || !StrKey.isValidContract(value)) throw new UserError("La dirección de la cuenta no es válida.");
  return value;
}

export function text(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) throw new UserError(`Falta ${what}.`);
  return value;
}
