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

/**
 * Reads an amount typed with "." for thousands and "," for decimals, up to
 * cents. Null if it is not a positive amount.
 */
export function parseAmount(text: string): bigint | null {
  const typed = text.trim();
  // Dots only group thousands; a dot as the decimal point is refused rather than read ten times too large.
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(typed)) return null;
  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(typed.replaceAll(".", ""));
  if (!match) return null;
  const amount = BigInt(match[1]!) * UNIT + BigInt((match[2] ?? "").padEnd(TOKEN_DECIMALS, "0"));
  return amount > 0n ? amount : null;
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The two letters a business goes by where its name does not fit. */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/** `part` as a whole percentage of `whole`. */
export const percent = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Math.round(Number((part * 1000n) / whole) / 10));

/** A name cut to `length` characters. */
export const clip = (name: string, length: number) => (name.length > length ? `${name.slice(0, length - 1).trimEnd()}…` : name);

const shortDate = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" });
const dateTime = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

/** "6 oct" */
export const formatDate = (value: string | Date) => shortDate.format(new Date(value));
/** "06-10-2026, 15:00" */
export const formatDateTime = (value: string | Date) => dateTime.format(new Date(value));

const DAY_MS = 24 * 60 * 60_000;

/** Whole days from `now` to `value`: negative when it is in the past. */
export function daysUntil(value: string | Date, now = new Date()): number {
  const target = new Date(value);
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end - start) / DAY_MS);
}

/** "vence hoy", "vence en 3 días", "venció hace 2 días" */
export function dueInWords(value: string | Date, now = new Date()): string {
  const days = daysUntil(value, now);
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  if (days === -1) return "venció ayer";
  if (days > 0) return `vence en ${days} días`;
  return `venció hace ${-days} días`;
}

/** "hoy", "ayer", "hace 3 días", or the date when it is older than a month. */
export function agoInWords(value: string | Date, now = new Date()): string {
  const days = -daysUntil(value, now);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 31) return `hace ${days} días`;
  return formatDate(value);
}

/** A date typed in a date field, as the moment the day ends in the viewer's time zone. */
export function endOfDay(input: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return undefined;
  const [year, month, day] = input.split("-").map(Number);
  return new Date(year!, month! - 1, day!, 23, 59, 59);
}

/** `text` for a date field: YYYY-MM-DD in the viewer's time zone. */
export function dateInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** The SHA-256 of a text, as the contract stores a document's reference. */
export async function referenceHash(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()));
  return new Uint8Array(digest);
}

export const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
