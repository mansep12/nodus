/** What the business has to do for things to move, if anything. */
export function Pending({ toAccept, toSign }: { toAccept: number; toSign: number }) {
  if (toAccept + toSign === 0) return null;
  const notices = [
    toSign > 0 && (toSign === 1 ? "Falta tu firma en un círculo." : `Falta tu firma en ${toSign} círculos.`),
    toAccept > 0 && (toAccept === 1 ? "Tienes una deuda por aceptar." : `Tienes ${toAccept} deudas por aceptar.`),
  ].filter(Boolean);
  return (
    <p role="status" className="rounded-2xl border border-debt/30 bg-debt-soft px-5 py-3 text-sm font-medium text-debt">
      {notices.join(" ")}
    </p>
  );
}
