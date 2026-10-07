import Link from "next/link";

interface Props {
  toAccept: number;
  toSign: number;
  /** Where those things are waiting, to offer the way there. */
  href?: string;
}

/** What the business has to do for things to move, if anything. */
export function Pending({ toAccept, toSign, href }: Props) {
  if (toAccept + toSign === 0) return null;
  const notices = [
    toSign > 0 && (toSign === 1 ? "Falta tu firma en un círculo." : `Falta tu firma en ${toSign} círculos.`),
    toAccept > 0 && (toAccept === 1 ? "Tienes una deuda por aceptar." : `Tienes ${toAccept} deudas por aceptar.`),
  ].filter(Boolean);
  return (
    <p
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border border-hairline bg-card px-5 py-3.5 text-body-sm"
    >
      <span className="flex items-center gap-3">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
        {notices.join(" ")}
      </span>
      {href && (
        <Link href={href} className="font-medium underline underline-offset-4 hover:text-body">
          Ir a la bandeja
        </Link>
      )}
    </p>
  );
}
