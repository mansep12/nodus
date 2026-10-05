"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { useState } from "react";
import type { SettlementView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { Amount, Button, Card } from "./ui";

const when = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

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
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">Círculos desanudados</h2>
      <Card className="!py-2">
        <ul className="divide-y divide-line">
          {settlements.map(({ txHash, closedAt, circle }) => (
            <li key={txHash} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <p>
                  Se cancelaron{" "}
                  <strong className="font-semibold">
                    <Amount value={circle.cleared} />
                  </strong>{" "}
                  {circle.moved === "0" ? (
                    "sin mover dinero"
                  ) : (
                    <>
                      moviendo{" "}
                      <strong className="font-semibold">
                        <Amount value={circle.moved} />
                      </strong>
                    </>
                  )}{" "}
                  entre {circle.parties.length} negocios.
                </p>
                <p className="flex items-center gap-4 text-sm text-muted">
                  <span>
                    {when.format(new Date(closedAt))} ·{" "}
                    <a
                      href={`${EXPLORER_URL}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono underline underline-offset-4 hover:text-ink"
                    >
                      {txHash.slice(0, 8)}
                    </a>
                  </span>
                  <Button variant="quiet" aria-expanded={open === txHash} onClick={() => setOpen(open === txHash ? null : txHash)}>
                    {open === txHash ? "Ocultar" : "Ver detalle"}
                  </Button>
                </p>
              </div>
              {open === txHash && (
                <div className="mt-4">
                  <CircleCard circle={circle} me={me} nameOf={nameOf} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
