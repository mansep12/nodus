/** Deployment settings that both the browser and the server read. */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Run \`bun run --filter @nodus/e2e deploy\` to create apps/web/.env.local.`);
  return value;
}

export const NODUS_CONTRACT = required("NEXT_PUBLIC_NODUS_CONTRACT", process.env.NEXT_PUBLIC_NODUS_CONTRACT);
export const TOKEN_CONTRACT = required("NEXT_PUBLIC_TOKEN_CONTRACT", process.env.NEXT_PUBLIC_TOKEN_CONTRACT);

/** Keys kept in browser storage instead of device passkeys. For automated testing only. */
export const SOFTWARE_PASSKEYS = process.env.NEXT_PUBLIC_SOFTWARE_PASSKEYS === "1";

export const TOKEN_SYMBOL = "USDC";
export const TOKEN_DECIMALS = 7;
