import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, initials } from "@/lib/format";
import { INK, type Tone } from "@/lib/tones";

/*
 * The pieces every screen is built from, after DESIGN.md. Colours, type and
 * shapes are decided here and in `globals.css`; screens only compose.
 */

const BUTTON_STYLES = {
  primary: "bg-primary text-white hover:bg-ink active:bg-ink disabled:bg-muted-soft",
  outline: "border border-hairline-strong text-ink hover:border-ink disabled:text-muted-soft disabled:hover:border-hairline-strong",
  quiet: "text-body underline-offset-4 hover:text-ink hover:underline disabled:opacity-50",
};

const BUTTON_SIZES = {
  md: "h-10 px-5 text-body-sm",
  sm: "h-8 px-3.5 text-caption",
  /** As tall as a form field, to sit beside one. */
  lg: "h-11 px-6 text-body-sm",
};

type ButtonVariant = keyof typeof BUTTON_STYLES;
type ButtonSize = keyof typeof BUTTON_SIZES;

/** The look of a button, for the rare link that has to look like one. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  const shape = variant === "quiet" ? "text-sm" : `rounded-full font-medium ${BUTTON_SIZES[size]}`;
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${shape} ${BUTTON_STYLES[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows that the action is under way and prevents repeating it. */
  busy?: boolean;
}

export function Button({ variant = "primary", size = "md", busy, disabled, className = "", children, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={disabled || busy} className={`${buttonClass(variant, size)} ${className}`}>
      {busy && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

const CARD_PADDING = {
  md: "p-6 sm:p-8",
  sm: "p-5",
  /** For rows and figures that go edge to edge. */
  none: "",
};

interface CardProps {
  padding?: keyof typeof CARD_PADDING;
  className?: string;
  children: ReactNode;
}

export function Card({ padding = "md", className = "", children }: CardProps) {
  return <section className={`rounded-2xl border border-hairline bg-card ${CARD_PADDING[padding]} ${className}`}>{children}</section>;
}

const EYEBROW_SIZES = {
  md: "",
  sm: "text-tiny",
};

interface EyebrowProps {
  size?: keyof typeof EYEBROW_SIZES;
  className?: string;
  children: ReactNode;
}

/** The label over a section or a figure. */
export function Eyebrow({ size = "md", className = "", children }: EyebrowProps) {
  return <p className={`eyebrow text-muted ${EYEBROW_SIZES[size]} ${className}`}>{children}</p>;
}

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** What goes at the far end of the title: a figure, an action. */
  aside?: ReactNode;
  children?: ReactNode;
}

/** How every page begins: what it is, in display type, and a line about it. */
export function PageHeader({ eyebrow, title, aside, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div className="max-w-2xl">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="display mt-3 text-[40px] text-balance sm:text-5xl">{title}</h1>
        {children && <p className="mt-4 text-body">{children}</p>}
      </div>
      {aside}
    </header>
  );
}

/** A row of choices of which one is on: the ways to settle a circle, the pages of the app. */
export const SEGMENTS = "flex gap-1 rounded-full bg-surface-strong p-1 text-sm";

export const segment = (on: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition-colors ${on ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink"}`;

/** A state, as a small pill. A tone says which side of the books it is about. */
export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-label font-semibold uppercase leading-none tracking-[0.07em] ${INK[tone].softBackground} ${INK[tone].text}`}
    >
      {children}
    </span>
  );
}

/** An amount with its symbol set small beside it. Read aloud with a pause between them, "270 USDC", which the text alone has not. */
export function Amount({ value, symbol = true }: { value: bigint | string; symbol?: boolean }) {
  const figure = formatAmount(value);
  return (
    <span className="tabular-nums" aria-label={symbol ? `${figure} ${TOKEN_SYMBOL}` : undefined}>
      {figure}
      {symbol && (
        <span className="ml-[0.28em] font-sans text-[clamp(10px,0.34em,14px)] font-medium tracking-[0.06em] text-muted">
          {TOKEN_SYMBOL}
        </span>
      )}
    </span>
  );
}

/** The mark of something done. Its colour comes from a `stroke-*` class. */
export function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.3 L5 8.6 L9.5 3.6" />
    </svg>
  );
}

interface Step {
  label: string;
  state: "done" | "doing" | "todo";
}

const STEP_MARKS = {
  done: `border-transparent ${INK.free.background}`,
  doing: "animate-pulse border-ink bg-card",
  todo: "border-hairline-strong bg-card",
};

/** What something goes through on its way to being done, and how far it has got. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "doing" ? "step" : undefined}
          className="relative flex items-center gap-3 pb-3 last:pb-0"
        >
          {/* The line down to the next step. */}
          {index < steps.length - 1 && (
            <span aria-hidden className="absolute bottom-0 left-2 top-4 w-px -translate-x-1/2 bg-hairline-strong" />
          )}
          <span
            className={`relative grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-500 ${STEP_MARKS[step.state]}`}
          >
            {step.state === "done" && <Tick className="size-2.5 stroke-card" />}
          </span>
          <span className={`text-sm transition-colors duration-500 ${step.state === "todo" ? "text-muted" : "text-ink"}`}>
            {step.label}
            {step.state === "done" && <span className="sr-only"> (listo)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A message about something that went wrong. */
export function Problem({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error-deep">
      {children}
    </p>
  );
}

const AVATAR_SIZES = {
  sm: "size-8 text-[10.5px]",
  md: "size-10 text-xs",
};

interface AvatarProps {
  name: string;
  /** `ink` is the business looking; a tone is the side of the books the other one is on. */
  tone?: Tone | "ink";
  size?: keyof typeof AVATAR_SIZES;
}

/** A business as it is drawn in the graphs: a ring with its initials. */
export function Avatar({ name, tone = "neutral", size = "md" }: AvatarProps) {
  const ring = tone === "ink" ? "border-ink bg-ink text-white" : `${INK[tone].border} bg-card text-ink`;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full border-2 font-semibold ${AVATAR_SIZES[size]} ${ring}`}>
      {initials(name)}
    </span>
  );
}

/** A soft blur of one of the pastels, behind a drawing or a headline. Its parent must be `relative`. */
export function Bloom({ color, className = "" }: { color: string; className?: string }) {
  return <span aria-hidden className={`bloom ${className}`} style={{ "--bloom": color } as CSSProperties} />;
}

/** A trefoil: the simplest knot there is, drawn as its three strands passing under one another, in a box of 32. */
export const KNOT = [
  "M24.69 17.46C24.82 17.34 25.22 16.98 25.46 16.72C25.70 16.47 25.92 16.21 26.12 15.94C26.31 15.68 26.49 15.40 26.65 15.13C26.81 14.86 26.94 14.57 27.06 14.30C27.17 14.02 27.26 13.73 27.33 13.46C27.40 13.18 27.45 12.90 27.47 12.62C27.49 12.35 27.50 12.08 27.48 11.81C27.46 11.55 27.42 11.29 27.35 11.04C27.29 10.79 27.20 10.54 27.10 10.31C26.99 10.08 26.87 9.86 26.72 9.65C26.58 9.44 26.41 9.24 26.23 9.06C26.05 8.88 25.84 8.71 25.63 8.56C25.41 8.41 25.18 8.27 24.93 8.16C24.68 8.04 24.42 7.94 24.14 7.85C23.87 7.77 23.58 7.71 23.28 7.66C22.99 7.62 22.68 7.59 22.36 7.59C22.05 7.58 21.72 7.60 21.39 7.64C21.06 7.67 20.73 7.73 20.39 7.80C20.05 7.88 19.71 7.98 19.37 8.10C19.03 8.21 18.69 8.35 18.35 8.51C18.01 8.67 17.67 8.85 17.34 9.04C17.00 9.24 16.67 9.46 16.35 9.69C16.03 9.92 15.71 10.17 15.40 10.44C15.10 10.71 14.80 10.99 14.51 11.29C14.22 11.59 13.94 11.90 13.68 12.23C13.42 12.56 13.17 12.90 12.93 13.25C12.69 13.60 12.47 13.96 12.26 14.33C12.06 14.70 11.79 15.27 11.69 15.46",
  "M10.61 23.17C10.65 23.34 10.76 23.87 10.86 24.20C10.96 24.54 11.08 24.86 11.21 25.16C11.34 25.47 11.49 25.76 11.65 26.03C11.81 26.31 11.98 26.56 12.16 26.80C12.35 27.04 12.55 27.26 12.76 27.46C12.96 27.66 13.18 27.84 13.41 28.00C13.63 28.16 13.87 28.29 14.10 28.41C14.34 28.52 14.59 28.62 14.84 28.69C15.09 28.76 15.34 28.81 15.59 28.83C15.84 28.85 16.10 28.86 16.35 28.84C16.61 28.81 16.86 28.77 17.11 28.70C17.36 28.63 17.61 28.54 17.84 28.43C18.08 28.32 18.32 28.19 18.55 28.03C18.77 27.88 18.99 27.70 19.20 27.50C19.41 27.30 19.61 27.09 19.80 26.85C19.98 26.62 20.16 26.36 20.32 26.09C20.48 25.82 20.63 25.53 20.76 25.23C20.90 24.93 21.02 24.61 21.12 24.28C21.22 23.94 21.31 23.60 21.38 23.25C21.44 22.89 21.50 22.52 21.53 22.15C21.56 21.78 21.58 21.40 21.57 21.01C21.57 20.62 21.55 20.23 21.51 19.83C21.47 19.44 21.41 19.04 21.33 18.64C21.25 18.24 21.15 17.84 21.04 17.44C20.93 17.04 20.79 16.64 20.64 16.25C20.49 15.86 20.32 15.47 20.14 15.09C19.95 14.71 19.75 14.34 19.53 13.97C19.32 13.61 18.96 13.09 18.84 12.91",
  "M12.70 8.12C12.53 8.07 12.02 7.90 11.68 7.82C11.34 7.74 11.01 7.68 10.68 7.64C10.35 7.60 10.02 7.59 9.71 7.59C9.39 7.59 9.08 7.61 8.78 7.65C8.48 7.69 8.19 7.76 7.92 7.84C7.64 7.92 7.37 8.01 7.12 8.13C6.87 8.25 6.64 8.38 6.42 8.53C6.20 8.68 5.99 8.85 5.81 9.02C5.63 9.20 5.46 9.40 5.31 9.61C5.16 9.81 5.03 10.03 4.92 10.26C4.82 10.49 4.73 10.74 4.66 10.98C4.60 11.23 4.55 11.49 4.53 11.76C4.50 12.02 4.50 12.29 4.53 12.56C4.55 12.84 4.59 13.12 4.66 13.40C4.72 13.67 4.81 13.96 4.92 14.24C5.03 14.52 5.16 14.80 5.32 15.07C5.47 15.35 5.65 15.62 5.84 15.89C6.04 16.15 6.26 16.42 6.49 16.67C6.73 16.92 6.98 17.17 7.25 17.41C7.53 17.64 7.82 17.87 8.12 18.09C8.43 18.30 8.75 18.51 9.09 18.70C9.43 18.89 9.78 19.07 10.14 19.23C10.51 19.39 10.88 19.54 11.27 19.67C11.65 19.80 12.05 19.92 12.45 20.02C12.85 20.12 13.26 20.20 13.68 20.27C14.09 20.33 14.51 20.38 14.93 20.41C15.35 20.44 15.78 20.45 16.20 20.45C16.63 20.44 17.26 20.39 17.47 20.38",
];
/** How long each strand is, for what draws them stroke by stroke. */
export const KNOT_STRAND = 27.84;

export function Knot({ className = "", strokeWidth = 2.2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden
    >
      {KNOT.map((strand) => (
        <path key={strand.slice(0, 12)} d={strand} />
      ))}
    </svg>
  );
}

/** What a page shows while it has nothing to show. */
export function Empty({ tone = "neutral", title, children }: { tone?: Tone; title: string; children: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl border border-hairline bg-canvas-soft px-6 py-20 text-center">
      <Bloom color={INK[tone].bloom} className="left-1/2 top-1/2 -z-10 size-80 -translate-x-1/2 -translate-y-1/2 opacity-70" />
      <Knot className="mx-auto size-10" strokeWidth={1.4} />
      <p className="display mt-5 text-3xl">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-body">{children}</p>
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Knot className="size-[1.4em]" />
      <span className="font-serif text-[1.25em] leading-none tracking-[-0.02em]">Nodus</span>
    </span>
  );
}
