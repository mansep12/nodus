"use client";

import { useQuery } from "@tanstack/react-query";
import { EXPLORER_URL } from "@nodus/stellar";
import { useState } from "react";
import { get } from "@/lib/api";
import { partyOf } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, formatDateTime, percent } from "@/lib/format";
import { useNodus } from "@/lib/nodus";
import { INK } from "@/lib/tones";
import type { SettlementView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { Amount, Button, Card, Empty, Eyebrow, PageHeader, SEGMENTS, segment } from "./ui";

const PAGE = 20;

/** Every circle the business settled, and what the whole network has done. */
export function HistoryView() {
  const { state, me, nameOf } = useNodus();
  const [scope, setScope] = useState<"mine" | "network">("mine");
  const [extra, setExtra] = useState<SettlementView[]>([]);
  const loaded = state.settlements.length + extra.length;
  const more = useQuery({
    queryKey: ["settlements", me, loaded],
    queryFn: () => get<{ settlements: SettlementView[] }>(`/api/settlements?offset=${loaded}&limit=${PAGE}`),
    enabled: false,
  });
  const settlements = [...state.settlements, ...extra];
  const cleared = settlements.reduce((sum, settlement) => sum + BigInt(settlement.circle.cleared), 0n);
  const moved = settlements.reduce((sum, settlement) => sum + BigInt(settlement.circle.moved), 0n);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Historial"
        title="Círculos desanudados"
        aside={
          <div role="radiogroup" aria-label="Qué historial mostrar" className={SEGMENTS}>
            {[
              { value: "mine" as const, label: "Mis círculos" },
              { value: "network" as const, label: "Toda la red" },
            ].map((choice) => (
              <button
                key={choice.value}
                role="radio"
                aria-checked={scope === choice.value}
                onClick={() => setScope(choice.value)}
                className={segment(scope === choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        }
      >
        Cada liquidación es una sola transacción en Stellar: cancela todas las deudas del círculo a la vez y paga los saldos netos.
        Cualquiera puede verificarla en la red.
      </PageHeader>

      {scope === "network" ? (
        <Figures
          figures={[
            { label: "Negocios en Nodus", value: state.network.businesses.toLocaleString("es-CL") },
            { label: "Círculos desanudados", value: state.network.settlements.toLocaleString("es-CL") },
            { label: "Deuda cancelada", value: <Amount value={state.network.cleared} /> },
            {
              label: "Se canceló sin mover dinero",
              value: `${percent(BigInt(state.network.cleared) - BigInt(state.network.moved), BigInt(state.network.cleared))} %`,
            },
          ]}
          note="Lo que la red entera ha hecho. Quién participó en cada círculo solo lo ven sus partes."
        />
      ) : settlements.length === 0 ? (
        <Empty title="Todavía no desanudas ningún círculo">
          Cuando todos los negocios de un círculo tuyo firmen, la liquidación quedará aquí con su transacción.
        </Empty>
      ) : (
        <>
          <Figures
            figures={[
              { label: "Deuda cancelada", value: <Amount value={cleared} /> },
              { label: "Dinero que hubo que mover", value: <Amount value={moved} /> },
              { label: "Se canceló sin mover dinero", value: `${percent(cleared - moved, cleared)} %` },
            ]}
          />
          <History settlements={settlements} me={me} nameOf={nameOf} />
          {loaded < state.settlementsTotal && (
            <Button
              variant="outline"
              className="self-center"
              busy={more.isFetching}
              onClick={async () => {
                const { data } = await more.refetch();
                if (data) setExtra((current) => [...current, ...data.settlements]);
              }}
            >
              Ver más ({state.settlementsTotal - loaded} restantes)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Figures({ figures, note }: { figures: Array<{ label: string; value: React.ReactNode }>; note?: string }) {
  return (
    <Card
      padding="none"
      className={`grid divide-hairline max-sm:divide-y sm:divide-x ${figures.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      {figures.map((figure) => (
        <div key={figure.label} className="px-7 py-6">
          <Eyebrow>{figure.label}</Eyebrow>
          <p className="display mt-3 text-4xl">{figure.value}</p>
        </div>
      ))}
      {note && <p className="px-7 py-4 text-caption text-muted sm:col-span-full sm:border-t sm:border-hairline">{note}</p>}
    </Card>
  );
}

interface Props {
  settlements: SettlementView[];
  me: string;
  nameOf: (address: string) => string;
}

/** The receipt of a settlement for the books: what it meant for the business, with the transaction that proves it. */
export function receipt(settlement: SettlementView, me: string, nameOf: (address: string) => string): string {
  const { circle, txHash, closedAt } = settlement;
  const mine = partyOf(circle, me);
  const rows: string[][] = [
    ["Comprobante de compensación Nodus", ""],
    ["Fecha", formatDateTime(closedAt)],
    ["Transacción", txHash],
    ["Verificar en", `${EXPLORER_URL}/tx/${txHash}`],
    ["Negocios en el círculo", String(circle.parties.length)],
    ["Deuda cancelada en el círculo", `${formatAmount(circle.cleared)} ${TOKEN_SYMBOL}`],
    ["Dinero movido en el círculo", `${formatAmount(circle.moved)} ${TOKEN_SYMBOL}`],
    [],
    ["Mi negocio", nameOf(me)],
    ["Dejé de deber", `${formatAmount(mine?.owesLess ?? "0")} ${TOKEN_SYMBOL}`],
    ["Dejaron de deberme", `${formatAmount(mine?.owedLess ?? "0")} ${TOKEN_SYMBOL}`],
    [
      BigInt(mine?.net ?? "0") >= 0n ? "Recibí" : "Pagué",
      `${formatAmount(BigInt(mine?.net ?? "0") < 0n ? -BigInt(mine!.net) : (mine?.net ?? "0"))} ${TOKEN_SYMBOL}`,
    ],
    [],
    ["Deuda", "Monto cancelado"],
    ...circle.clearings.map((clearing) => [`N.º ${clearing.id}`, `${formatAmount(clearing.amount)} ${TOKEN_SYMBOL}`]),
    [],
    ["Con quién", "Deuda cancelada"],
    ...circle.edges
      .filter((edge) => edge.amount !== null)
      .map((edge) => [
        edge.from === me ? `Yo le debía a ${nameOf(edge.to)}` : `${nameOf(edge.from)} me debía`,
        `${formatAmount(edge.amount!)} ${TOKEN_SYMBOL}`,
      ]),
  ];
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}

/** Every settlement so far, each with the transaction that proves it. */
export function History({ settlements, me, nameOf }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  if (settlements.length === 0) return null;

  const download = (settlement: SettlementView) => {
    const blob = new Blob([receipt(settlement, me, nameOf)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nodus-compensacion-${settlement.txHash.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ul className="flex flex-col gap-3">
      {settlements.map((settlement) => {
        const { txHash, closedAt, circle } = settlement;
        const mine = partyOf(circle, me);
        const net = BigInt(mine?.net ?? "0");
        return (
          <li key={txHash} className="overflow-hidden rounded-2xl border border-hairline bg-card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${INK.free.softBackground}`}>
                <svg
                  viewBox="0 0 12 12"
                  className={`size-3.5 ${INK.free.stroke}`}
                  fill="none"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.5 6.3 L5 8.6 L9.5 3.6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1 basis-72">
                <p className="text-title">
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
                <p className="mt-1 text-caption text-muted">
                  {formatDateTime(closedAt)}
                  {mine &&
                    ` · dejaste de deber ${formatAmount(mine.owesLess)}, dejaron de deberte ${formatAmount(mine.owedLess)}${
                      net === 0n ? "" : net > 0n ? `, recibiste ${formatAmount(net)}` : `, pagaste ${formatAmount(-net)}`
                    }`}
                </p>
              </div>
              <a
                href={`${EXPLORER_URL}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-caption text-muted underline underline-offset-4 hover:text-ink"
              >
                {txHash.slice(0, 8)}
              </a>
              <Button variant="quiet" onClick={() => download(settlement)}>
                Comprobante
              </Button>
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
        );
      })}
    </ul>
  );
}
