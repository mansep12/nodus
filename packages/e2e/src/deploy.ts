/**
 * Deploys a test token and the Nodus contract to testnet and points the web
 * app at them by updating its environment file.
 *
 *   bun run deploy                        # apps/web/.env.local
 *   bun run deploy --out <environment file>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployWorld, log } from "./harness.ts";

const out = process.argv.indexOf("--out");
const envFile =
  out === -1 ? fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url)) : path.resolve(process.argv[out + 1] ?? "");

const world = await deployWorld();
const values: Record<string, string> = {
  NEXT_PUBLIC_NODUS_CONTRACT: world.nodusId,
  NEXT_PUBLIC_TOKEN_CONTRACT: world.token,
  NODUS_DEPLOY_LEDGER: String(world.deployLedger),
  // The operator issued the test token, so its key is what the faucet mints with.
  TOKEN_ISSUER_SECRET: world.operator.secret(),
};
if (process.env.OZ_CHANNELS_API_KEY) values.OZ_CHANNELS_API_KEY = process.env.OZ_CHANNELS_API_KEY;

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
