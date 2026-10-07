import { Logo } from "../ui";
import { HACKATHON, LICENSE_URL, REPO_URL, TRANSACTIONS } from "./facts";
import { CONTAINER } from "./section";

const LINKS = [
  { href: REPO_URL, label: "Código en GitHub" },
  { href: LICENSE_URL, label: "Licencia MIT" },
  { href: TRANSACTIONS.twenty.url, label: "Transacción de 20 negocios" },
  { href: TRANSACTIONS.three.url, label: "Transacción sin mover dinero" },
];

/** Where the page ends: what this is, and where to check it. */
export function LandingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className={`${CONTAINER} flex flex-col gap-8 py-10 text-caption text-muted sm:flex-row sm:items-start sm:justify-between`}>
        <div className="max-w-xs">
          <Logo className="text-title text-ink" />
          <p className="mt-3">Compensación multilateral de deudas entre pymes, sobre la red de pruebas de Stellar.</p>
          <p className="mt-1">Hecho para el hackathon «{HACKATHON}».</p>
        </div>
        <nav aria-label="Enlaces">
          <ul className="flex flex-col gap-y-2 sm:items-end">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer" className="rounded-sm underline-offset-4 hover:text-ink hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
