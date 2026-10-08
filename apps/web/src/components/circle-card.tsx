"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { signCircle } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { EASE, UNTYING } from "@/lib/motion";
import { INK } from "@/lib/tones";
import type { CircleView, SettlementView } from "@/lib/types";
import { CircleGraph, netInWords, useUntying } from "./circle-graph";
import { CopyButton } from "./fields";
import { downloadReceipt } from "./receipt";
import { Amount, Avatar, Bloom, Button, Chip, Eyebrow, Problem, SEGMENTS, Steps, segment } from "./ui";

interface Props {
  circle: CircleView;
  me: string;
  nameOf: (address: string) => string;
  /** Token balance of the account, if known. */
  balance?: bigint | null;
  /** The latest ledger, to tell how long is left to sign. */
  ledger?: number;
  /** Whether the viewer may sign settlements at all: a clerk may not. */
  canSign?: boolean;
  /** Where this card can be reached by link, to share it with the others. */
  href?: string;
  /** Whether the card was opened from such a link. */
  highlighted?: boolean;
  /** The settlement that untied the circle, where its receipt should be at hand. */
  settlement?: SettlementView;
}

const SECONDS_PER_LEDGER = 5;
/** How the receipt slides out from under the figures. */
const SLIDE = { duration: 0.7, ease: EASE };

function timeLeft(ledgers: number): string {
  const minutes = Math.max(1, Math.round((ledgers * SECONDS_PER_LEDGER) / 60));
  if (minutes < 90) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  return `${Math.round(minutes / 60)} horas`;
}

/** Names the businesses the party knows and counts the ones it does not. */
export function inWords(names: string[], unnamed: number): string {
  const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`);
  if (unnamed === 0) return list(names);
  const others = `${unnamed} ${unnamed === 1 ? "negocio" : "negocios"}${names.length > 0 ? " más" : ""}`;
  return names.length > 0 ? `${names.join(", ")} y ${others}` : others;
}

/** A circle of debts: what settling it does, who has signed, and the button to sign. */
export function CircleCard({ circle, me, nameOf, balance = null, ledger, canSign = true, href, highlighted = false, settlement }: Props) {
  const status = circle.proposal?.status;
  const settled = status === "settled";
  const signing = status === "open";
  const untying = useUntying(settled);
  // While the knot tightens the card still says it is on its way; what it leaves behind comes as the knot lets go.
  const sending = status === "submitted" || untying === "tight";
  const done = settled && !sending;

  // Until someone signs, the parties can choose to cancel only what the debts
  // have in common, which needs no money. The first signature settles the choice.
  const canChoose = circle.netOnly !== undefined && (status === undefined || status === "failed");
  const [withoutMoney, setWithoutMoney] = useState(false);
  const shown: CircleView = canChoose && withoutMoney ? { ...circle, ...circle.netOnly } : circle;

  const sign = useAction(() => signCircle(shown, me));
  const mine = shown.parties.find((party) => party.address === me);
  const signedCount = shown.parties.filter((party) => party.signed).length;
  const movesMoney = shown.moved !== "0";

  // A business knows by name only the ones it deals with in the circle.
  const known = (address: string) => shown.parties.find((party) => party.address === address)?.known ?? false;
  const missing = shown.parties.filter((party) => !party.signed);
  const missingInWords = inWords(
    missing.filter((party) => known(party.address)).map((party) => nameOf(party.address)),
    missing.filter((party) => !known(party.address)).length,
  );
  const strangers = shown.parties.filter((party) => !party.known).length;

  const net = BigInt(mine?.net ?? "0");
  const shortfall = balance !== null && net < 0n && balance < -net ? -net - balance : 0n;

  return (
    <article
      id={`circulo-${circle.key.slice(0, 16)}`}
      className={`grid overflow-hidden rounded-3xl border bg-card lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] ${highlighted ? "border-ink shadow-lift" : "border-hairline"}`}
    >
      <div className="relative isolate flex flex-col items-center justify-center overflow-hidden border-b border-hairline bg-canvas-soft px-2 py-4 lg:border-b-0 lg:border-r">
        {/* The blooms take a breath as the knot lets go. */}
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10"
          initial={false}
          animate={{ scale: untying === "loose" ? [1, 1.2, 1.06] : 1 }}
          transition={{ duration: untying === "loose" ? UNTYING.loose * 1.4 : 0.6, ease: "easeInOut" }}
        >
          <Bloom
            color={done ? INK.free.bloom : INK.neutral.bloom}
            className="left-1/2 top-1/2 size-[82%] -translate-x-1/2 -translate-y-1/2 opacity-60"
          />
          <Bloom color={done ? "var(--color-sky)" : INK.debt.bloom} className="left-[18%] top-[62%] size-[46%] opacity-50" />
        </motion.div>
        <div className="hidden w-full justify-center sm:flex">
          <CircleGraph circle={shown} me={me} nameOf={nameOf} untying={untying} />
        </div>
        {/* On a phone the names do not fit beside the nodes, so they go in a list below. */}
        <div className="w-full sm:hidden">
          <CircleGraph circle={shown} me={me} nameOf={nameOf} labels={false} untying={untying} />
          <ul className="mt-1 flex flex-col gap-2.5 px-4 pb-2 text-sm">
            {shown.parties
              .filter((party) => party.known)
              .map((party) => (
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
        {strangers > 0 && (
          <p className="px-6 pb-2 text-center text-label text-muted">
            {strangers === 1 ? "Otro negocio del círculo no se nombra" : `Otros ${strangers} negocios del círculo no se nombran`}: solo ves
            con quién tratas tú.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div>
          {done ? (
            <Chip tone="free">Desanudado</Chip>
          ) : sending ? (
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
          <p className="mt-3 text-body-sm leading-relaxed text-body">
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
                <dt className="text-caption text-muted">{figure.label}</dt>
                <dd className={`display mt-1 text-[26px] ${figure.tone}`}>
                  <Amount value={figure.value} symbol={false} />
                </dd>
              </div>
            ))}
          </dl>
        )}

        <AnimatePresence initial={false}>
          {done && settlement && (
            <motion.div
              key="receipt"
              className="-mt-6 overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={SLIDE}
            >
              <motion.div initial={{ y: -28 }} animate={{ y: 0 }} transition={SLIDE} className="pt-3">
                <Receipt settlement={settlement} me={me} nameOf={nameOf} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto flex flex-col gap-3">
          {!settled && !sending && shown.parties.length > 0 && (
            <div className="flex items-center gap-3 text-caption text-muted">
              <span className="flex gap-1" aria-hidden>
                {shown.parties.map((party) => (
                  <span
                    key={party.address}
                    className={`h-1.5 w-5 rounded-full ${party.signed ? INK.free.background : "bg-hairline-strong"}`}
                  />
                ))}
              </span>
              <span>
                {signedCount} de {shown.parties.length} firmas
              </span>
            </div>
          )}

          {sending ? (
            <Steps
              steps={[
                { label: "Firmas completas", state: "done" },
                { label: settled ? "Enviada a la red" : "Enviando a la red…", state: settled ? "done" : "doing" },
                { label: "Confirmada en la red", state: settled ? "done" : "todo" },
              ]}
            />
          ) : settled ? (
            // With the receipt at hand, the link is on it.
            !settlement && <TransactionLink txHash={shown.proposal?.txHash} className="self-start text-body-sm" />
          ) : !mine ? (
            <p className="text-sm text-body">Tu negocio no participa en este círculo.</p>
          ) : mine.signed ? (
            <p className="text-sm text-body">
              Ya firmaste. {missing.length === 1 ? "Falta la firma de" : "Faltan las firmas de"} {missingInWords}.
            </p>
          ) : !canSign ? (
            <p className="text-sm text-body">Firmar una liquidación le toca al dueño de la cuenta; tu llave solo lleva los libros.</p>
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

          {!settled && !sending && href && mine && (
            <p className="flex flex-wrap items-center gap-x-3 text-caption text-muted">
              <span>¿Falta alguien? Mándale el enlace de este círculo.</span>
              <CopyButton text={href} label="Copiar enlace" copied="Enlace copiado" className="!text-caption" />
            </p>
          )}

          {signing && ledger !== undefined && shown.proposal && (
            <p className="text-caption text-muted">
              Quedan cerca de {timeLeft(shown.proposal.expirationLedger - ledger)} para reunir las firmas.
            </p>
          )}

          <Problem>{sign.error ?? (status === "failed" && `El intento anterior no se completó: ${shown.proposal?.error}`)}</Problem>
        </div>
      </div>
    </article>
  );
}

/** Where anyone can check the transaction that settled a circle. */
function TransactionLink({ txHash, className = "" }: { txHash?: string; className?: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className={`font-medium underline underline-offset-4 ${INK.free.text} ${className}`}
    >
      Ver la transacción en la red
    </a>
  );
}

/** The proof of a settlement, to keep: when it was, the transaction, and the file for the books. */
function Receipt({ settlement, me, nameOf }: { settlement: SettlementView; me: string; nameOf: (address: string) => string }) {
  const { txHash, closedAt } = settlement;
  return (
    <div className="rounded-2xl border border-dashed border-hairline-strong bg-canvas-soft px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Eyebrow size="sm">Comprobante</Eyebrow>
        <p className="text-caption text-muted">{formatDateTime(closedAt)}</p>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-caption text-ink" title={txHash}>
          {txHash.slice(0, 8)}…{txHash.slice(-8)}
        </span>
        <CopyButton text={txHash} label="Copiar" copied="Transacción copiada" className="!text-caption" />
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <TransactionLink txHash={txHash} />
        <Button variant="quiet" onClick={() => downloadReceipt(settlement, me, nameOf)}>
          Descargar
        </Button>
      </p>
    </div>
  );
}
