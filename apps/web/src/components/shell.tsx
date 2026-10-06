"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { countPending } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { useNodus } from "@/lib/nodus";
import { Avatar, Button, Logo, SEGMENTS, segment } from "./ui";

/** What surrounds every page of a business: who it is, where it can go, and where to check it all on the network. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { state, me, nameOf, base, leave } = useNodus();
  const pathname = usePathname();
  const pending = countPending(state, me);
  const home = base || "/";
  const pages = [
    { href: home, label: "Red", count: 0 },
    { href: `${base}/bandeja`, label: "Bandeja", count: pending.toSign + pending.toAccept },
    { href: `${base}/historial`, label: "Historial", count: 0 },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 md:h-16 md:py-0">
        <Link href={home} aria-label="Nodus">
          <Logo className="text-[17px]" />
        </Link>

        <nav aria-label="Páginas" className={`${SEGMENTS} order-last w-full justify-center md:order-none md:w-auto`}>
          {pages.map((page) => (
            <Link key={page.href} href={page.href} aria-current={pathname === page.href ? "page" : undefined} className={`${segment(pathname === page.href)} max-md:flex-1 max-md:justify-center`}>
              {page.label}
              {page.count > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-white tabular-nums">
                  {page.count}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium">{nameOf(me)}</p>
            <p className="font-mono text-[11px] text-muted">{shortAddress(me)}</p>
          </div>
          <Avatar name={nameOf(me)} tone="ink" size="sm" />
          <Button variant="quiet" onClick={leave}>
            Salir
          </Button>
        </div>
      </header>

      {/* Each page settles into place as it is opened. */}
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
        className="flex-1 pb-20 pt-10 sm:pt-14"
      >
        {children}
      </motion.main>

      <footer className="flex flex-wrap gap-x-8 gap-y-2 border-t border-hairline py-6 text-[13px] text-muted">
        <span>Red de pruebas de Stellar</span>
        <ExplorerLink label="Contrato de Nodus" contract={state.contract} />
        <ExplorerLink label={`Token ${TOKEN_SYMBOL} de prueba`} contract={state.token} />
      </footer>
    </div>
  );
}

/** Where anyone can check on the network what the app says. */
function ExplorerLink({ label, contract }: { label: string; contract: string }) {
  return (
    <a href={`${EXPLORER_URL}/contract/${contract}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
      {label} <span className="font-mono text-xs">{shortAddress(contract)}</span>
    </a>
  );
}
