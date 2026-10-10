/** Test tokens, minted by the issuer of the installation's own test asset. */
import "server-only";
import { Address, Keypair, authorizeEntry, nativeToScVal } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, relay } from "@nodus/stellar";
import { TOKEN_CONTRACT, TOKEN_DECIMALS } from "@/lib/config";
import { forgetBalances, latestLedger, simulate } from "./chain";

export const FAUCET_AMOUNT = 1_000n * 10n ** BigInt(TOKEN_DECIMALS);

/** Whether this installation can hand out test tokens: only while the token is its own test asset. */
export const hasFaucet = () => Boolean(process.env.TOKEN_ISSUER_SECRET && process.env.OZ_CHANNELS_API_KEY);

/** Mints test tokens to `address`. Returns the hash of the transaction. */
export async function mintTestTokens(address: string): Promise<string> {
  const issuer = Keypair.fromSecret(process.env.TOKEN_ISSUER_SECRET!);
  const args = [Address.fromString(address).toScVal(), nativeToScVal(FAUCET_AMOUNT, { type: "i128" })];
  const { operation, result } = await simulate(TOKEN_CONTRACT, "mint", args);
  const expiration = (await latestLedger()) + 100;
  const auth = await Promise.all((result.auth ?? []).map((entry) => authorizeEntry(entry, issuer, expiration, NETWORK_PASSPHRASE)));
  const txHash = await relay(
    process.env.OZ_CHANNELS_API_KEY!,
    operation.func.toXDR("base64"),
    auth.map((entry) => entry.toXDR("base64")),
  );
  forgetBalances();
  return txHash;
}
