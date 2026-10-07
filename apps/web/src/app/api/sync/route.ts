import { maintain } from "@/server/db";
import { AuthError, respond } from "@/server/errors";

export const maxDuration = 300;

/**
 * The maintenance a scheduler calls: catches up with the chain, keeps open
 * debts alive and squares the copy with the contract. Protected by
 * CRON_SECRET, which Vercel's scheduler sends as a bearer token.
 */
async function run(request: Request) {
  return respond(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) throw new AuthError("No autorizado.");
    if (!secret && process.env.NODE_ENV === "production") throw new AuthError("CRON_SECRET no está configurado.");
    return maintain();
  });
}

export const GET = run;
export const POST = run;
