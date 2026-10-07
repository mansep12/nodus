import { Address, xdr } from "@stellar/stellar-sdk";
import { ACCOUNT_WASM_HASH, relay } from "@nodus/stellar";
import { NODUS_CONTRACT } from "@/lib/config";

export const maxDuration = 60;

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
  if (!isSponsored(func)) {
    return Response.json({ success: false, error: "This relayer only sponsors Nodus transactions" }, { status: 403 });
  }

  const apiKey = process.env.OZ_CHANNELS_API_KEY;
  if (!apiKey) return Response.json({ success: false, error: "The relayer is not configured" }, { status: 500 });
  try {
    return Response.json({ success: true, data: { hash: await relay(apiKey, func, auth) } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

/** We pay only for calls to the Nodus contract and for creating smart accounts. */
function isSponsored(funcXdr: string): boolean {
  try {
    const func = xdr.HostFunction.fromXDR(funcXdr, "base64");
    switch (func.switch().name) {
      case "hostFunctionTypeInvokeContract":
        return Address.fromScAddress(func.invokeContract().contractAddress()).toString() === NODUS_CONTRACT;
      case "hostFunctionTypeCreateContractV2": {
        const executable = func.createContractV2().executable();
        return executable.switch().name === "contractExecutableWasm" && executable.wasmHash().toString("hex") === ACCOUNT_WASM_HASH;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
