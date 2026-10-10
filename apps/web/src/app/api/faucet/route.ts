import { respond, UserError } from "@/server/errors";
import { FAUCET_AMOUNT, hasFaucet, mintTestTokens } from "@/server/faucet";
import { LIMITS, clientIp } from "@/server/limits";
import { requireSession } from "@/server/session";

export const maxDuration = 60;

/** Mints test tokens to the account of the session. Only works while the token is our own test asset. */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireSession();
    if (!hasFaucet()) throw new UserError("Esta instalación no entrega fondos de prueba.");
    await LIMITS.faucetPerIp(clientIp(request));
    await LIMITS.faucetPerAddress(session.address);
    return { txHash: await mintTestTokens(session.address), amount: FAUCET_AMOUNT.toString() };
  });
}
