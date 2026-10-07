/** Transactions the installation sends on its own, with the relayer paying. */
import "server-only";
import { rpc } from "@stellar/stellar-sdk";
import { relay } from "@nodus/stellar";
import { nodus, server } from "./chain";

const KEEP_ALIVE_BATCH = 50;

function relayerKey(): string {
  const apiKey = process.env.OZ_CHANNELS_API_KEY;
  if (!apiKey) throw new Error("OZ_CHANNELS_API_KEY is not set");
  return apiKey;
}

/** Keeps the given obligations from expiring on chain. Nobody has to sign: anyone may call it. */
export async function keepAlive(ids: bigint[]): Promise<void> {
  for (let at = 0; at < ids.length; at += KEEP_ALIVE_BATCH) {
    const batch = ids.slice(at, at + KEEP_ALIVE_BATCH);
    const draft = await nodus.keep_alive({ ids: batch });
    const operation = draft.built!.operations[0] as { func: { toXDR(format: "base64"): string } };
    const txHash = await relay(relayerKey(), operation.func.toXDR("base64"), []);
    const result = await server.pollTransaction(txHash, { attempts: 20 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`keep_alive ended as ${result.status}`);
  }
}
