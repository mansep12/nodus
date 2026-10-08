import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { UserError } from "./errors";

/** The JSON body of a request, as an object. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  // A form on another site cannot send this content type without the browser asking first.
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) throw new UserError("La solicitud no es válida.");
  const parsed: unknown = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new UserError("La solicitud no es válida.");
  return parsed as Record<string, unknown>;
}

/** A smart account address. */
export function account(value: unknown): string {
  if (typeof value !== "string" || !StrKey.isValidContract(value)) throw new UserError("La dirección de la cuenta no es válida.");
  return value;
}

export function text(value: unknown, what: string, max = 1_000): string {
  if (typeof value !== "string" || value.length === 0) throw new UserError(`Falta ${what}.`);
  if (value.length > max) throw new UserError(`${what[0]!.toUpperCase()}${what.slice(1)} es demasiado largo.`);
  return value;
}

export function optionalText(value: unknown, what: string, max = 1_000): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : text(value, what, max);
}

export function integer(value: unknown, what: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max) throw new UserError(`${what} no es válido.`);
  return number;
}

export function optionalInteger(value: unknown, what: string, bounds?: { min?: number; max?: number }): number | undefined {
  return value === undefined || value === null || value === "" ? undefined : integer(value, what, bounds);
}

/** A 32-byte hash as lowercase hex. */
export function hash32(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) throw new UserError(`${what} no es válido.`);
  return value.toLowerCase();
}

/** The hostname and origin a request was made to, for WebAuthn. */
export function relyingParty(request: Request): { rpId: string; origins: string[] } {
  const url = new URL(request.url);
  const origins = new Set([url.origin]);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) origins.add(`${forwardedProto}://${forwardedHost}`);
  const origin = request.headers.get("origin");
  if (origin) origins.add(origin);
  const rpId = forwardedHost ? forwardedHost.split(":")[0]! : url.hostname;
  return { rpId, origins: [...origins] };
}
