import { Address, xdr } from "@stellar/stellar-sdk";
import { ACCOUNT_WASM_HASH, relay } from "@nodus/stellar";
import { NODUS_CONTRACT } from "@/lib/config";
import { forgetBalances, forgetRules, isSmartAccount } from "@/server/chain";
import { RateLimited } from "@/server/errors";
import { LIMITS, clientIp } from "@/server/limits";

export const maxDuration = 60;

/** What an account may change about itself with our fee: its signers and rules. */
const ACCOUNT_ADMIN = new Set(["add_context_rule", "remove_context_rule", "add_signer", "remove_signer", "add_policy", "remove_policy"]);

type Sponsored = { kind: "call" } | { kind: "account" } | { kind: "admin"; account: string };

/**
 * Submits a transaction through the relayer, which pays its fee, so that
 * businesses never need XLM. Speaks the protocol of smart-account-kit's
 * relayer client: `{ func, auth }` in, `{ success, data: { hash } }` out.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { func?: unknown; auth?: unknown } | null;
  const func = body?.func;
  const auth = body?.auth;
  if (typeof func !== "string" || !Array.isArray(auth) || !auth.every((entry) => typeof entry === "string")) {
    return Response.json({ success: false, error: "Expected { func, auth }" }, { status: 400 });
  }
  const sponsored = await classify(func);
  if (!sponsored) {
    return Response.json({ success: false, error: "This relayer only sponsors Nodus transactions" }, { status: 403 });
  }

  const apiKey = process.env.OZ_CHANNELS_API_KEY;
  if (!apiKey) return Response.json({ success: false, error: "The relayer is not configured" }, { status: 500 });
  try {
    const ip = clientIp(request);
    await LIMITS.relayPerIp(ip);
    if (sponsored.kind === "account") await LIMITS.accountsPerIp(ip);
    const hash = await relay(apiKey, func, auth);
    forgetBalances();
    if (sponsored.kind === "admin") forgetRules(sponsored.account);
    return Response.json({ success: true, data: { hash } });
  } catch (error) {
    if (error instanceof RateLimited) return Response.json({ success: false, error: error.message }, { status: 429 });
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

/**
 * We pay only for calls to the Nodus contract, for creating smart accounts,
 * and for a smart account changing its own signers and rules.
 */
export async function classify(funcXdr: string): Promise<Sponsored | undefined> {
  try {
    const func = xdr.HostFunction.fromXDR(funcXdr, "base64");
    switch (func.switch().name) {
      case "hostFunctionTypeInvokeContract": {
        const call = func.invokeContract();
        const contract = Address.fromScAddress(call.contractAddress()).toString();
        if (contract === NODUS_CONTRACT) return { kind: "call" };
        const fn = call.functionName().toString();
        if (ACCOUNT_ADMIN.has(fn) && (await isSmartAccount(contract))) return { kind: "admin", account: contract };
        return undefined;
      }
      case "hostFunctionTypeCreateContractV2": {
        const executable = func.createContractV2().executable();
        const isAccount =
          executable.switch().name === "contractExecutableWasm" && executable.wasmHash().toString("hex") === ACCOUNT_WASM_HASH;
        return isAccount ? { kind: "account" } : undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
