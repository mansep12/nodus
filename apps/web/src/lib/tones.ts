/**
 * The inks the books are kept in, and every way they get used. Components
 * take a tone and look its classes up here, so that what blue, red and green
 * mean is decided in one place (and their values in `globals.css`).
 *
 * - `credit`: what the business is owed.
 * - `debt`: what the business owes.
 * - `free`: what is done: signed, settled.
 * - `neutral`: none of the above.
 */
export type Tone = "credit" | "debt" | "free" | "neutral";

interface Ink {
  /** For drawings. */
  stroke: string;
  fill: string;
  softFill: string;
  /** For boxes and text. */
  border: string;
  softBorder: string;
  background: string;
  softBackground: string;
  text: string;
  /** The pastel bloom that goes with it, as a CSS colour. */
  bloom: string;
}

export const INK: Record<Tone, Ink> = {
  credit: {
    stroke: "stroke-credit",
    fill: "fill-credit",
    softFill: "fill-credit-soft",
    border: "border-credit",
    softBorder: "border-credit/25",
    background: "bg-credit",
    softBackground: "bg-credit-soft",
    text: "text-credit-deep",
    bloom: "var(--color-sky)",
  },
  debt: {
    stroke: "stroke-debt",
    fill: "fill-debt",
    softFill: "fill-debt-soft",
    border: "border-debt",
    softBorder: "border-debt/25",
    background: "bg-debt",
    softBackground: "bg-debt-soft",
    text: "text-debt-deep",
    bloom: "var(--color-peach)",
  },
  free: {
    stroke: "stroke-free",
    fill: "fill-free",
    softFill: "fill-free-soft",
    border: "border-free",
    softBorder: "border-free/25",
    background: "bg-free",
    softBackground: "bg-free-soft",
    text: "text-free-deep",
    bloom: "var(--color-mint)",
  },
  neutral: {
    stroke: "stroke-muted-soft",
    fill: "fill-muted-soft",
    softFill: "fill-surface-strong",
    border: "border-primary",
    softBorder: "border-hairline",
    background: "bg-primary",
    softBackground: "bg-surface-strong",
    text: "text-ink",
    bloom: "var(--color-lavender)",
  },
};
