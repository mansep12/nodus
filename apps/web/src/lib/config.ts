/** Deployment settings that both the browser and the server read. */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Run \`bun run --filter @nodus/e2e deploy\` to create apps/web/.env.local.`);
  return value;
}

export const NODUS_CONTRACT = required("NEXT_PUBLIC_NODUS_CONTRACT", process.env.NEXT_PUBLIC_NODUS_CONTRACT);
export const TOKEN_CONTRACT = required("NEXT_PUBLIC_TOKEN_CONTRACT", process.env.NEXT_PUBLIC_TOKEN_CONTRACT);

/** The policy that lets a limited key call only some functions of Nodus; unset when roles are not available. */
export const ALLOWLIST_POLICY = process.env.NEXT_PUBLIC_ALLOWLIST_POLICY || undefined;

/**
 * Keys kept in browser storage instead of device passkeys. For automated
 * testing only, and never in production: those keys are not protected by
 * the device.
 */
export const SOFTWARE_PASSKEYS = process.env.NEXT_PUBLIC_SOFTWARE_PASSKEYS === "1" && process.env.NODE_ENV !== "production";

export const TOKEN_SYMBOL = "USDC";
export const TOKEN_DECIMALS = 7;

/** The functions of Nodus a clerk's key may call: everything but settling and paying. */
export const CLERK_FUNCTIONS = ["register", "accept", "reject", "cancel"] as const;
