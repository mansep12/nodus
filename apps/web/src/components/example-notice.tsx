"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip } from "./ui";

const STEPS = [
  <>
    Abre la <Link href="/bandeja">Bandeja</Link> y firma el círculo que está listo: los otros dos negocios firman a los pocos segundos y una
    sola transacción cancela las tres deudas.
  </>,
  <>
    Para armar otro, acepta la nueva factura de Molino Andes y registra en <Link href="/">Red</Link> que Fletes Ruta 5 te debe 90. Cuando el
    transportista la acepte, el círculo aparece en la Bandeja.
  </>,
  <>
    En el <Link href="/historial">Historial</Link>, cada liquidación enlaza a su transacción en la red de pruebas de Stellar.
  </>,
];

/**
 * Said above the pages of an example business: that it is made up, who
 * answers for the others, and what there is to try.
 */
export function ExampleNotice() {
  const [open, setOpen] = useState(true);
  return (
    <aside aria-label="Negocio de ejemplo" className="border-b border-hairline bg-surface-strong">
      <div className="mx-auto max-w-[1200px] px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-body">
          <Chip>Negocio de ejemplo</Chip>
          <p className="min-w-0 flex-1">
            Este negocio y sus vecinos son inventados y viven en la red de pruebas. Los vecinos responden solos: aceptan lo que registres y
            firman los círculos que firmes.
          </p>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((shown) => !shown)}
            className="rounded-sm font-medium text-ink underline underline-offset-4"
          >
            {open ? "Ocultar qué probar" : "Qué probar"}
          </button>
        </div>
        {open && (
          <ol className="mt-3 grid gap-x-8 gap-y-2 text-caption text-body sm:grid-cols-3 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4">
            {STEPS.map((step, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="font-semibold text-ink tabular-nums">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
