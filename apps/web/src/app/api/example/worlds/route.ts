import { NETWORK_PASSPHRASE } from "@nodus/stellar";
import { AuthError, respond, UserError } from "@/server/errors";
import { addWorld, forgetUnfinished, worldCounts, type ActorInput } from "@/server/examples";
import { account, body, optionalText, text } from "@/server/input";
import { isOperator } from "@/server/limits";

function requireOperator(request: Request) {
  if (!isOperator(request)) throw new AuthError("No autorizado.");
  // The keys handed over here are kept by the server: never those of a network where things are worth something.
  if (!/test/i.test(NETWORK_PASSPHRASE)) throw new UserError("Los negocios de ejemplo solo existen en la red de pruebas.");
}

/** How many example worlds wait for a visitor, for the script that makes them. */
export async function GET(request: Request) {
  return respond(async () => {
    requireOperator(request);
    return worldCounts();
  });
}

/** Takes in an example world that the operator's script finished making. */
export async function POST(request: Request) {
  return respond(async () => {
    requireOperator(request);
    const input = await body(request);
    if (!Array.isArray(input.neighbors) || input.neighbors.length === 0 || input.neighbors.length > 30) {
      throw new UserError("Faltan los vecinos del negocio de ejemplo.");
    }
    return addWorld({ business: actor(input.business), neighbors: input.neighbors.map(actor) });
  });
}

/** Takes out of the directory the accounts of a world its script could not finish. */
export async function DELETE(request: Request) {
  return respond(async () => {
    requireOperator(request);
    const input = await body(request);
    if (!Array.isArray(input.addresses) || input.addresses.length > 500) throw new UserError("Faltan las cuentas.");
    return forgetUnfinished(input.addresses.map(account));
  });
}

function actor(value: unknown): ActorInput {
  const given = (value ?? {}) as { address?: unknown; part?: unknown; passkey?: Record<string, unknown> };
  return {
    address: account(given.address),
    part: optionalText(given.part, "el papel", 20),
    passkey: {
      credentialId: text(given.passkey?.credentialId, "la passkey", 200),
      privateKey: text(given.passkey?.privateKey, "la llave", 2_000),
      publicKey: text(given.passkey?.publicKey, "la llave pública", 2_000),
    },
  };
}
