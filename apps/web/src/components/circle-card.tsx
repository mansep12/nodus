"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { useState } from "react";
import { signCircle } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { INK } from "@/lib/tones";
import type { CircleView } from "@/lib/types";
import { CircleGraph, netInWords } from "./circle-graph";
import { Amount, Avatar, Bloom, Button, Chip, Problem, SEGMENTS, segment } from "./ui";

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

/** Names the businesses the party knows and counts the ones it does not. */
function inWords(names: string[], unnamed: number): string {
  if (unnamed === 0) return names.join(", ");
  const others = `${unnamed} ${unnamed === 1 ? "negocio" : "negocios"}${names.length > 0 ? " más" : ""}`;
  return names.length > 0 ? `${names.join(", ")} y ${others}` : others;
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
  const movesMoney = shown.moved !== "0";

  // A business knows by name only the ones it deals with in the circle.
  const dealsWith = new Set(shown.edges.flatMap((edge) => (edge.from === me ? [edge.to] : edge.to === me ? [edge.from] : [])));
  const known = (address: string) => address === me || dealsWith.has(address);
  const missing = shown.parties.filter((party) => !party.signed);
  const missingInWords = inWords(
    missing.filter((party) => known(party.address)).map((party) => nameOf(party.address)),
    missing.filter((party) => !known(party.address)).length,
  );

  const net = BigInt(mine?.net ?? "0");
  const shortfall = balance !== null && net < 0n && balance < -net ? -net - balance : 0n;

  return (
    <article className="grid overflow-hidden rounded-3xl border border-hairline bg-card lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <div className="relative isolate flex items-center justify-center overflow-hidden border-b border-hairline bg-canvas-soft px-2 py-4 lg:border-b-0 lg:border-r">
        <Bloom color={settled ? INK.free.bloom : INK.neutral.bloom} className="left-1/2 top-1/2 -z-10 size-[82%] -translate-x-1/2 -translate-y-1/2 opacity-60" />
        <Bloom color={settled ? "var(--color-sky)" : INK.debt.bloom} className="left-[18%] top-[62%] -z-10 size-[46%] opacity-50" />
        <div className="hidden w-full justify-center sm:flex">
          <CircleGraph circle={shown} me={me} nameOf={nameOf} />
        </div>
        {/* On a phone the names do not fit beside the nodes, so they go in a list below. */}
        <div className="w-full sm:hidden">
          <CircleGraph circle={shown} me={me} nameOf={nameOf} labels={false} />
          <ul className="mt-1 flex flex-col gap-2.5 px-4 pb-2 text-sm">
            {shown.parties.filter((party) => known(party.address)).map((party) => (
              <li key={party.address} className="flex items-center gap-3">
                <Avatar name={nameOf(party.address)} size="sm" tone={party.address === me ? "ink" : "neutral"} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {nameOf(party.address)}
                  {party.address === me && " (tú)"}
                </span>
                {party.address === me && <span className="text-muted tabular-nums">{netInWords(BigInt(party.net), settled)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div>
          {settled ? (
            <Chip tone="free">Desanudado</Chip>
          ) : status === "submitted" ? (
            <Chip tone="free">Liquidando…</Chip>
          ) : signing ? (
            <Chip tone="credit">
              Firmando · {signedCount} de {shown.parties.length}
            </Chip>
          ) : (
            <Chip>Círculo detectado</Chip>
          )}
          <h3 className="display mt-4 text-[28px] text-balance sm:text-[32px]">
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
          <p className="mt-3 text-[15px] leading-relaxed text-body">
            {settled
              ? `Los ${shown.parties.length} negocios firmaron y una sola transacción canceló las deudas${movesMoney ? " y pagó los saldos netos" : ""}.`
              : movesMoney
                ? `${shown.parties.length} negocios se deben en círculo. Si todos firman, una sola transacción cancela las ${shown.clearings.length} deudas y paga los saldos netos. Si falta una firma, no pasa nada.`
                : `${shown.parties.length} negocios se deben en círculo. Si todos firman, una sola transacción cancela lo que sus deudas tienen en común, sin que nadie pague. Si falta una firma, no pasa nada.`}
          </p>
        </div>

        {canChoose && (
          <div role="radiogroup" aria-label="Cómo liquidar el círculo" className={`${SEGMENTS} self-start`}>
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
                className={segment(withoutMoney === choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}

        {mine && (
          <dl className="grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline">
            {[
              { label: settled ? "Dejaste de deber" : "Dejas de deber", value: mine.owesLess, tone: "" },
              { label: settled ? "Dejaron de deberte" : "Dejan de deberte", value: mine.owedLess, tone: "" },
              {
                label: net > 0n ? (settled ? "Recibiste" : "Recibes") : settled ? "Pagaste" : "Pagas",
                value: net < 0n ? -net : net,
                tone: net > 0n ? INK.free.text : "",
              },
            ].map((figure) => (
              <div key={figure.label} className="px-4 py-3.5">
                <dt className="text-[13px] text-muted">{figure.label}</dt>
                <dd className={`display mt-1 text-[26px] ${figure.tone}`}>
                  <Amount value={figure.value} symbol={false} />
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex flex-col gap-3">
          {!settled && shown.parties.length > 0 && (
            <div className="flex items-center gap-3 text-[13px] text-muted">
              <span className="flex gap-1" aria-hidden>
                {shown.parties.map((party) => (
                  <span key={party.address} className={`h-1.5 w-5 rounded-full ${party.signed ? INK.free.background : "bg-hairline-strong"}`} />
                ))}
              </span>
              <span>
                {signedCount} de {shown.parties.length} firmas
              </span>
            </div>
          )}

          {settled ? (
            <a
              href={`${EXPLORER_URL}/tx/${shown.proposal?.txHash}`}
              target="_blank"
              rel="noreferrer"
              className={`self-start text-[15px] font-medium underline underline-offset-4 ${INK.free.text}`}
            >
              Ver la transacción en la red
            </a>
          ) : status === "submitted" ? (
            <p className="text-sm text-body">Están todas las firmas. Enviando la liquidación a la red…</p>
          ) : !mine ? (
            <p className="text-sm text-body">Tu negocio no participa en este círculo.</p>
          ) : mine.signed ? (
            <p className="text-sm text-body">
              Ya firmaste. {missing.length === 1 ? "Falta la firma de" : "Faltan las firmas de"} {missingInWords}.
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
            <p className="text-[13px] text-muted">
              Quedan cerca de {timeLeft(shown.proposal.expirationLedger - ledger)} para reunir las firmas.
            </p>
          )}

          <Problem>
            {sign.error ?? (status === "failed" && `El intento anterior no se completó: ${shown.proposal?.error}`)}
          </Problem>
        </div>
      </div>
    </article>
  );
}
