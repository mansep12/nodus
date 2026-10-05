"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { useState } from "react";
import { signCircle } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { CircleView } from "@/lib/types";
import { CircleGraph, initials, netInWords } from "./circle-graph";
import { Amount, Button, Card, Chip, Problem } from "./ui";

interface Props {
  circle: CircleView;
  me: string;
  nameOf: (address: string) => string;
  /** Token balance of the account, if known. */
  balance?: bigint | null;
  /** The latest ledger, to tell how long is left to sign. */
  ledger?: number;
}

const SECONDS_PER_LEDGER = 5;

function timeLeft(ledgers: number): string {
  const minutes = Math.max(1, Math.round((ledgers * SECONDS_PER_LEDGER) / 60));
  if (minutes < 90) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  return `${Math.round(minutes / 60)} horas`;
}

/** A circle of debts: what settling it does, who has signed, and the button to sign. */
export function CircleCard({ circle, me, nameOf, balance = null, ledger }: Props) {
  const status = circle.proposal?.status;
  const settled = status === "settled";
  const signing = status === "open";

  // Until someone signs, the parties can choose to cancel only what the debts
  // have in common, which needs no money. The first signature settles the choice.
  const canChoose = circle.netOnly !== undefined && (status === undefined || status === "failed");
  const [withoutMoney, setWithoutMoney] = useState(false);
  const shown: CircleView = canChoose && withoutMoney ? { ...circle, ...circle.netOnly } : circle;

  const sign = useAction(me, () => signCircle(shown, me));
  const mine = shown.parties.find((party) => party.address === me);
  const signedCount = shown.parties.filter((party) => party.signed).length;
  const missing = shown.parties.filter((party) => !party.signed).map((party) => nameOf(party.address));
  const movesMoney = shown.moved !== "0";

  const net = BigInt(mine?.net ?? "0");
  const shortfall = balance !== null && net < 0n && balance < -net ? -net - balance : 0n;

  return (
    <Card className="grid items-center gap-6 lg:grid-cols-2">
      <div className="hidden justify-center sm:flex">
        <CircleGraph circle={shown} me={me} nameOf={nameOf} />
      </div>
      {/* On a phone the names do not fit beside the nodes, so they go in a list below. */}
      <div className="sm:hidden">
        <CircleGraph circle={shown} me={me} nameOf={nameOf} labels={false} />
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {shown.parties.map((party) => (
            <li key={party.address} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-ink text-xs font-semibold">
                {initials(nameOf(party.address))}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {nameOf(party.address)}
                {party.address === me && " (tú)"}
              </span>
              <span className="text-muted tabular-nums">{netInWords(BigInt(party.net), settled)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          {settled ? (
            <Chip tone="free">Desanudado</Chip>
          ) : status === "submitted" ? (
            <Chip tone="free">Liquidando…</Chip>
          ) : signing ? (
            <Chip tone="debt">
              Firmando · {signedCount} de {shown.parties.length}
            </Chip>
          ) : (
            <Chip tone="debt">Círculo detectado</Chip>
          )}
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
            {settled ? "Se cancelaron " : "Se cancelan "}
            <Amount value={shown.cleared} />{" "}
            {movesMoney ? (
              <>
                moviendo solo <Amount value={shown.moved} />.
              </>
            ) : (
              "sin mover dinero."
            )}
          </h3>
          <p className="mt-2 text-sm text-muted">
            {settled
              ? `Los ${shown.parties.length} negocios firmaron y una sola transacción canceló las deudas${movesMoney ? " y pagó los saldos netos" : ""}.`
              : movesMoney
                ? `${shown.parties.length} negocios se deben en círculo. Si todos firman, una sola transacción cancela las ${shown.clearings.length} deudas y paga los saldos netos. Si falta una firma, no pasa nada.`
                : `${shown.parties.length} negocios se deben en círculo. Si todos firman, una sola transacción cancela lo que sus deudas tienen en común, sin que nadie pague. Si falta una firma, no pasa nada.`}
          </p>
        </div>

        {canChoose && (
          <div role="radiogroup" aria-label="Cómo liquidar el círculo" className="flex gap-1 self-start rounded-full bg-paper p-1 text-sm">
            {[
              { label: "Liquidar todo", value: false },
              { label: "Sin mover dinero", value: true },
            ].map((choice) => (
              <button
                key={choice.label}
                role="radio"
                aria-checked={withoutMoney === choice.value}
                disabled={sign.isPending}
                onClick={() => setWithoutMoney(choice.value)}
                className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                  withoutMoney === choice.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}

        {mine && (
          <dl className="grid grid-cols-3 gap-3 rounded-2xl bg-paper p-4 text-sm">
            <div>
              <dt className="text-muted">{settled ? "Dejaste de deber" : "Dejas de deber"}</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Amount value={mine.owesLess} symbol={false} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{settled ? "Dejaron de deberte" : "Dejan de deberte"}</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Amount value={mine.owedLess} symbol={false} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{net > 0n ? (settled ? "Recibiste" : "Recibes") : settled ? "Pagaste" : "Pagas"}</dt>
              <dd className={`mt-1 text-lg font-semibold ${net > 0n ? "text-free" : ""}`}>
                <Amount value={net < 0n ? -net : net} symbol={false} />
              </dd>
            </div>
          </dl>
        )}

        {settled ? (
          <a
            href={`${EXPLORER_URL}/tx/${shown.proposal?.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-free underline underline-offset-4"
          >
            Ver la transacción en la red
          </a>
        ) : status === "submitted" ? (
          <p className="text-sm text-muted">Están todas las firmas. Enviando la liquidación a la red…</p>
        ) : !mine ? (
          <p className="text-sm text-muted">Tu negocio no participa en este círculo.</p>
        ) : mine.signed ? (
          <p className="text-sm text-muted">
            Ya firmaste. {missing.length === 1 ? "Falta la firma de" : "Faltan las firmas de"} {missing.join(", ")}.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {shortfall > 0n && (
              <Problem>
                Te faltan {formatAmount(shortfall)} {TOKEN_SYMBOL} para pagar tu saldo neto.
                {canChoose && " Puedes compensar sin mover dinero."}
              </Problem>
            )}
            <Button onClick={() => sign.mutate(undefined)} busy={sign.isPending} disabled={shortfall > 0n} className="self-start">
              Firmar con passkey
            </Button>
          </div>
        )}

        {signing && ledger !== undefined && shown.proposal && (
          <p className="text-xs text-muted">
            Quedan cerca de {timeLeft(shown.proposal.expirationLedger - ledger)} para reunir las firmas.
          </p>
        )}

        <Problem>
          {sign.error ?? (status === "failed" && `El intento anterior no se completó: ${shown.proposal?.error}`)}
        </Problem>
      </div>
    </Card>
  );
}
