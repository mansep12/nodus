import { TOKEN_DECIMALS } from "./config";

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** A token amount the way it is written in Chile: 1.234,5 */
export function formatAmount(value: bigint | string): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const whole = (absolute / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = ((absolute % UNIT) * 100n) / UNIT;
  const fraction = cents === 0n ? "" : `,${cents.toString().padStart(2, "0").replace(/0$/, "")}`;
  return `${amount < 0n ? "−" : ""}${whole}${fraction}`;
}

/** Reads an amount typed with "." for thousands and "," for decimals. Null if it is not a positive amount. */
export function parseAmount(text: string): bigint | null {
  const match = /^(\d+)(?:,(\d{1,7}))?$/.exec(text.trim().replaceAll(".", ""));
  if (!match) return null;
  const amount = BigInt(match[1]!) * UNIT + BigInt((match[2] ?? "").padEnd(TOKEN_DECIMALS, "0"));
  return amount > 0n ? amount : null;
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The two letters a business goes by where its name does not fit. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/** `part` as a whole percentage of `whole`. */
export const percent = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Math.round(Number((part * 1000n) / whole) / 10));

/** A name cut to `length` characters. */
export const clip = (name: string, length: number) => (name.length > length ? `${name.slice(0, length - 1).trimEnd()}…` : name);
