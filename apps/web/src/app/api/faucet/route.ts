import { Address, Keypair, authorizeEntry, nativeToScVal } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, relay } from "@nodus/stellar";
import { TOKEN_CONTRACT, TOKEN_DECIMALS } from "@/lib/config";
import { latestLedger, simulate } from "@/server/chain";
import { respond, UserError } from "@/server/errors";
import { account, body } from "@/server/input";

export const maxDuration = 60;

const AMOUNT = 1_000n * 10n ** BigInt(TOKEN_DECIMALS);

/** Mints test tokens to a smart account. Only works while the token is our own test asset. */
export async function POST(request: Request) {
  return respond(async () => {
    const address = account((await body(request)).address);
    const issuerSecret = process.env.TOKEN_ISSUER_SECRET;
    const apiKey = process.env.OZ_CHANNELS_API_KEY;
    if (!issuerSecret || !apiKey) throw new UserError("Esta instalación no entrega fondos de prueba.");

    const args = [Address.fromString(address).toScVal(), nativeToScVal(AMOUNT, { type: "i128" })];
    const { operation, result } = await simulate(TOKEN_CONTRACT, "mint", args);
    const expiration = (await latestLedger()) + 100;
    const issuer = Keypair.fromSecret(issuerSecret);
    const auth = await Promise.all(
      (result.auth ?? []).map((entry) => authorizeEntry(entry, issuer, expiration, NETWORK_PASSPHRASE)),
    );
    const txHash = await relay(apiKey, operation.func.toXDR("base64"), auth.map((entry) => entry.toXDR("base64")));
    return { txHash, amount: AMOUNT.toString() };
  });
}
