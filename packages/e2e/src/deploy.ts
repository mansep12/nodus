/**
 * Deploys a test token and the Nodus contract to testnet and points the web
 * app at them by updating its environment file.
 *
 *   bun run deploy                        # apps/web/.env.local
 *   bun run deploy --out <environment file>
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployWorld, log } from "./harness.ts";

const out = process.argv.indexOf("--out");
const envFile =
  out === -1 ? fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url)) : path.resolve(process.argv[out + 1] ?? "");

/** The keys browsers subscribe to notifications with: a P-256 pair, base64url and raw. */
function vapidKeys() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { x, y, d } = pair.privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(x!, "base64url"), Buffer.from(y!, "base64url")]);
  return { publicKey: point.toString("base64url"), privateKey: Buffer.from(d!, "base64url").toString("base64url") };
}

const existing: Record<string, string> = Object.fromEntries(
  (existsSync(envFile) ? readFileSync(envFile, "utf8").split("\n") : [])
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1)]),
);

const world = await deployWorld();
const values: Record<string, string> = {
  NEXT_PUBLIC_NODUS_CONTRACT: world.nodusId,
  NEXT_PUBLIC_TOKEN_CONTRACT: world.token,
  NEXT_PUBLIC_ALLOWLIST_POLICY: world.allowlistId,
  NODUS_DEPLOY_LEDGER: String(world.deployLedger),
  // The operator issued the test token, so its key is what the faucet mints with.
  TOKEN_ISSUER_SECRET: world.operator.secret(),
};
if (process.env.OZ_CHANNELS_API_KEY) values.OZ_CHANNELS_API_KEY = process.env.OZ_CHANNELS_API_KEY;
// Secrets the app needs that do not depend on the deployment are kept once generated.
if (!existing.NODUS_SESSION_SECRET) values.NODUS_SESSION_SECRET = randomBytes(32).toString("base64url");
// What the scheduler and the installation's own scripts identify themselves with.
if (!existing.CRON_SECRET) values.CRON_SECRET = randomBytes(32).toString("base64url");
if (!existing.VAPID_PUBLIC_KEY || !existing.VAPID_PRIVATE_KEY) {
  const keys = vapidKeys();
  values.VAPID_PUBLIC_KEY = keys.publicKey;
  values.VAPID_PRIVATE_KEY = keys.privateKey;
  values.VAPID_SUBJECT = existing.VAPID_SUBJECT ?? "mailto:hola@example.com";
}

// Keep whatever else the file defines.
const kept = existsSync(envFile)
  ? readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !(line.split("=")[0]!.trim() in values))
  : [];
const lines = [...kept, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)];
writeFileSync(envFile, `${lines.join("\n")}\n`);
log(`Wrote ${envFile}`);
process.exit(0);
