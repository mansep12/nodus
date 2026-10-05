import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";

const BUTTON_STYLES = {
  primary: "bg-ink text-paper hover:bg-ink/85 disabled:bg-ink/40",
  secondary: "border border-line bg-surface text-ink hover:border-ink/30 disabled:text-muted",
  quiet: "text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_STYLES;
  /** Shows that the action is under way and prevents repeating it. */
  busy?: boolean;
}

export function Button({ variant = "primary", busy, disabled, className = "", children, ...props }: ButtonProps) {
  const shape = variant === "quiet" ? "text-sm" : "rounded-full px-5 py-2.5 text-sm font-medium";
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 transition-colors ${shape} ${BUTTON_STYLES[variant]} ${className}`}
    >
      {busy && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-3xl border border-line bg-surface p-6 sm:p-8 ${className}`}>{children}</section>;
}

const CHIP_STYLES = {
  neutral: "bg-paper text-muted",
  debt: "bg-debt-soft text-debt",
  free: "bg-free-soft text-free",
};

export function Chip({ tone = "neutral", children }: { tone?: keyof typeof CHIP_STYLES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${CHIP_STYLES[tone]}`}>
      {children}
    </span>
  );
}

export function Amount({ value, symbol = true }: { value: bigint | string; symbol?: boolean }) {
  return (
    <span className="tabular-nums">
      {formatAmount(value)}
      {symbol && <span className="ml-1 text-[0.7em] font-medium text-muted">{TOKEN_SYMBOL}</span>}
    </span>
  );
}

/** A message about something that went wrong. */
export function Problem({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-debt-soft px-4 py-3 text-sm text-debt">
      {children}
    </p>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-[1.4em]" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <circle cx="16" cy="10.5" r="6.5" />
        <circle cx="10.5" cy="20" r="6.5" />
        <circle cx="21.5" cy="20" r="6.5" />
      </svg>
      Nodus
    </span>
  );
}
