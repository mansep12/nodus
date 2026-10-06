"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { useState } from "react";
import { partyOf } from "@/lib/books";
import { percent } from "@/lib/format";
import { useNodus } from "@/lib/nodus";
import { INK } from "@/lib/tones";
import type { SettlementView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { Amount, Button, Card, Empty, Eyebrow, PageHeader } from "./ui";

const when = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

/** Every circle settled so far, and what they add up to. */
export function HistoryView() {
  const { state, me, nameOf } = useNodus();
  const { settlements } = state;
  const cleared = settlements.reduce((sum, settlement) => sum + BigInt(settlement.circle.cleared), 0n);
  const moved = settlements.reduce((sum, settlement) => sum + BigInt(settlement.circle.moved), 0n);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Historial" title="Círculos desanudados">
        Cada liquidación es una sola transacción en Stellar: cancela todas las deudas del círculo a la vez y paga los saldos netos.
        Cualquiera puede verificarla en la red.
      </PageHeader>

      {settlements.length === 0 ? (
        <Empty title="Todavía no se desanuda ningún círculo">
          Cuando todos los negocios de un círculo firmen, la liquidación quedará aquí con su transacción.
        </Empty>
      ) : (
        <>
          <Card className="grid divide-hairline !p-0 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
            {[
              { label: "Deuda cancelada", value: <Amount value={cleared} /> },
              { label: "Dinero que hubo que mover", value: <Amount value={moved} /> },
              { label: "Se canceló sin mover dinero", value: `${percent(cleared - moved, cleared)} %` },
            ].map((figure) => (
              <div key={figure.label} className="px-7 py-6">
                <Eyebrow>{figure.label}</Eyebrow>
                <p className="display mt-3 text-4xl">{figure.value}</p>
              </div>
            ))}
          </Card>
          <History settlements={settlements} me={me} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}

interface Props {
  settlements: SettlementView[];
  me: string;
  nameOf: (address: string) => string;
}

/** Every settlement so far, each with the transaction that proves it. */
export function History({ settlements, me, nameOf }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  if (settlements.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map(({ txHash, closedAt, circle }) => (
        <li key={txHash} className="overflow-hidden rounded-2xl border border-hairline bg-card">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
            <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${INK.free.softBackground}`}>
              <svg viewBox="0 0 12 12" className={`size-3.5 ${INK.free.stroke}`} fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.3 L5 8.6 L9.5 3.6" />
              </svg>
            </span>
            <div className="min-w-0 flex-1 basis-72">
              <p className="text-[17px]">
                Se cancelaron{" "}
                <strong className="font-medium">
                  <Amount value={circle.cleared} />
                </strong>{" "}
                {circle.moved === "0" ? (
                  "sin mover dinero"
                ) : (
                  <>
                    moviendo{" "}
                    <strong className="font-medium">
                      <Amount value={circle.moved} />
                    </strong>
                  </>
                )}{" "}
                entre {circle.parties.length} negocios.
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {when.format(new Date(closedAt))}
                {!partyOf(circle, me) && " · tu negocio no participó"}
              </p>
            </div>
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] text-muted underline underline-offset-4 hover:text-ink"
            >
              {txHash.slice(0, 8)}
            </a>
            <Button variant="outline" size="sm" aria-expanded={open === txHash} onClick={() => setOpen(open === txHash ? null : txHash)}>
              {open === txHash ? "Ocultar" : "Ver detalle"}
            </Button>
          </div>
          {open === txHash && (
            <div className="border-t border-hairline bg-canvas-soft p-3 sm:p-4">
              <CircleCard circle={circle} me={me} nameOf={nameOf} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
