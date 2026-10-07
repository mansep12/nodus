import { ALLOWLIST_POLICY } from "@/lib/config";
import { latestLedger } from "@/server/chain";
import { getDb, lastSyncedAt } from "@/server/db";
import { pushPublicKey } from "@/server/notify";

/** Whether the pieces the app depends on answer, and how far behind the copy of the contract is. */
export async function GET() {
  const checks = {
    database: await getDb().then(
      () => true,
      () => false,
    ),
    network: await latestLedger().then(
      () => true,
      () => false,
    ),
    relayer: Boolean(process.env.OZ_CHANNELS_API_KEY),
    notifications: Boolean(pushPublicKey()),
    roles: Boolean(ALLOWLIST_POLICY),
  };
  const syncedAt = lastSyncedAt();
  const lagSeconds = syncedAt.getTime() === 0 ? null : Math.round((Date.now() - syncedAt.getTime()) / 1000);
  const ok = checks.database && checks.network;
  return Response.json(
    { ok, checks, syncedAt: lagSeconds === null ? null : syncedAt.toISOString(), lagSeconds, allowlistPolicy: ALLOWLIST_POLICY ?? null },
    { status: ok ? 200 : 503 },
  );
}
