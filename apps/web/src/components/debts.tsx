"use client";

import { useState } from "react";
import { acceptDebt, cancelDebt, payDebt, registerDebt, rejectDebt } from "@/lib/actions";
import { post } from "@/lib/api";
import { isOpen, type Side } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { agoInWords, dateInput, daysUntil, dueInWords, endOfDay, formatAmount, parseAmount, referenceHash } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useNodus } from "@/lib/nodus";
import type { DirectoryMatch, ObligationView } from "@/lib/types";
import { Field, PickBusiness } from "./fields";
import { Confirm, useToast } from "./overlays";
import { Amount, Avatar, Button, Card, Chip, Problem, SEGMENTS, segment } from "./ui";

interface ListProps {
  title: string;
  empty: string;
  /** The side of the books these debts are on. */
  side: Side;
  obligations: ObligationView[];
  /** The other business being looked at, here or in the drawing above. */
  selected?: string | null;
  onSelect?: (address: string | null) => void;
}

type Shown = "open" | "all";

/** The debts on one side of a business: what it is owed, or what it owes. */
export function DebtList({ title, empty, side, obligations, selected = null, onSelect }: ListProps) {
  const { nameOf } = useNodus();
  const [shown, setShown] = useState<Shown>("open");
  // What still counts comes first; settled and withdrawn debts follow.
  const sorted = [...obligations].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || Number(BigInt(b.id) - BigInt(a.id)));
  const open = sorted.filter(isOpen);
  const listed = shown === "open" ? open : sorted;
  const past = sorted.length - open.length;

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pt-5">
        <h2 className="text-lg font-medium">
          {title}
          <span className="ml-2 text-sm font-normal text-muted">
            {open.length} {open.length === 1 ? "vigente" : "vigentes"}
          </span>
        </h2>
        {past > 0 && (
          <div role="radiogroup" aria-label="Qué deudas mostrar" className={`${SEGMENTS} !text-caption`}>
            {[
              { value: "open" as const, label: "Vigentes" },
              { value: "all" as const, label: `Todas (${sorted.length})` },
            ].map((choice) => (
              <button
                key={choice.value}
                role="radio"
                aria-checked={shown === choice.value}
                onClick={() => setShown(choice.value)}
                className={segment(shown === choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {listed.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-body-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline-soft pb-2">
          {listed.map((obligation) => {
            const other = side === "credit" ? obligation.debtor : obligation.creditor;
            return (
              <DebtRow
                key={obligation.id}
                obligation={obligation}
                side={side}
                name={nameOf(other)}
                highlighted={isOpen(obligation) && selected === other}
                onHover={(inside) => isOpen(obligation) && onSelect?.(inside ? other : null)}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}

interface RowProps {
  obligation: ObligationView;
  side: Side;
  /** The business at the other end of the debt. */
  name: string;
  highlighted: boolean;
  onHover: (inside: boolean) => void;
}

/** The state of a debt, as a chip: what still counts, what is waiting, what is done. */
export function DebtChip({ obligation, side }: { obligation: ObligationView; side: Side }) {
  const iAmCreditor = side === "credit";
  const partly = obligation.status === "accepted" && obligation.amount !== obligation.originalAmount;
  const paid = BigInt(obligation.paid) > 0n;
  switch (obligation.status) {
    case "pending":
      return <Chip tone={side}>{iAmCreditor ? "Esperando que acepte" : "Por aceptar"}</Chip>;
    case "accepted":
      return <Chip>{partly ? (paid ? "Vigente, pagada en parte" : "Vigente, compensada en parte") : "Vigente"}</Chip>;
    case "settled":
      return (
        <Chip tone="free">
          {paid && BigInt(obligation.paid) === BigInt(obligation.originalAmount) ? "Pagada" : paid ? "Compensada y pagada" : "Compensada"}
        </Chip>
      );
    case "cancelled":
      return <Chip>Anulada</Chip>;
    case "rejected":
      return <Chip>Rechazada</Chip>;
    case "expired":
      return <Chip>Ya no está en la red</Chip>;
  }
}

/** When a debt falls due, as a chip when it is close or past. */
function Due({ obligation }: { obligation: ObligationView }) {
  if (!obligation.dueAt || !isOpen(obligation)) return null;
  const days = daysUntil(obligation.dueAt);
  if (days > 7) return <span>{dueInWords(obligation.dueAt)}</span>;
  return <Chip tone={days < 0 ? "debt" : "neutral"}>{dueInWords(obligation.dueAt)}</Chip>;
}

function DebtRow({ obligation, side, name, highlighted, onHover }: RowProps) {
  const { role } = useNodus();
  const notify = useToast();
  const id = BigInt(obligation.id);
  const accept = useAction(() => acceptDebt(id), { onSuccess: () => notify("Deuda aceptada. Ya puede entrar en un círculo.") });
  const reject = useAction(() => rejectDebt(id), { onSuccess: () => notify("Deuda rechazada.") });
  const cancel = useAction(() => cancelDebt(id), { onSuccess: () => notify("Deuda anulada.") });
  const pay = useAction((amount: bigint) => payDebt(id, amount), { onSuccess: () => notify("Pago hecho.") });
  const [asking, setAsking] = useState<"reject" | "cancel" | "pay" | null>(null);
  const [payText, setPayText] = useState("");
  const payAmount = parseAmount(payText);
  const iAmCreditor = side === "credit";
  const open = isOpen(obligation);
  const problem = accept.error ?? reject.error ?? cancel.error ?? pay.error;

  return (
    <li
      className={`group px-6 py-3.5 transition-colors ${highlighted ? "bg-canvas-soft" : ""} ${open ? "" : "opacity-60"}`}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={name} size="sm" tone={open ? side : "neutral"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <DebtChip obligation={obligation} side={side} />
            <Due obligation={obligation} />
            <span>
              {obligation.note ? (
                <span title="El texto coincide con la referencia registrada en la red">{obligation.note} ✓</span>
              ) : obligation.reference ? (
                <span className="font-mono">ref. {obligation.reference.slice(0, 8)}</span>
              ) : (
                `Deuda n.º ${obligation.id}`
              )}
            </span>
            <span>· {agoInWords(obligation.registeredAt)}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-lg font-medium">
            <Amount value={open ? obligation.amount : obligation.originalAmount} />
          </p>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {obligation.status === "pending" && !iAmCreditor && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  busy={accept.isPending}
                  disabled={reject.isPending}
                  onClick={() => accept.mutate(undefined)}
                >
                  Aceptar
                </Button>
                <Button
                  variant="quiet"
                  className="!text-caption"
                  busy={reject.isPending}
                  disabled={accept.isPending}
                  onClick={() => setAsking("reject")}
                >
                  Rechazar
                </Button>
              </>
            )}
            {obligation.status === "accepted" && !iAmCreditor && role === "owner" && (
              <Button variant="outline" size="sm" busy={pay.isPending} onClick={() => setAsking("pay")}>
                Pagar
              </Button>
            )}
            {open && iAmCreditor && (
              <Button variant="quiet" className="!text-caption" busy={cancel.isPending} onClick={() => setAsking("cancel")}>
                Anular
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 empty:hidden">
        <Problem>{problem}</Problem>
      </div>

      <Confirm
        open={asking === "reject"}
        title="¿Rechazar esta deuda?"
        action="Rechazar con passkey"
        busy={reject.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          reject.mutate(undefined, { onSettled: () => setAsking(null) });
        }}
      >
        {name} registró que le debes <Amount value={obligation.amount} />. Si la rechazas, desaparece. Si {name} insiste, tendrá que
        registrarla de nuevo.
      </Confirm>

      <Confirm
        open={asking === "cancel"}
        title="¿Anular esta deuda?"
        action="Anular con passkey"
        busy={cancel.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          cancel.mutate(undefined, { onSettled: () => setAsking(null) });
        }}
      >
        Dejará de contar lo que {name} te debe por esta deuda: <Amount value={obligation.amount} />. Hazlo si te la pagaron por otro lado o
        si la perdonas. No se puede deshacer.
      </Confirm>

      <Confirm
        open={asking === "pay"}
        title={`Pagar a ${name}`}
        action="Pagar con passkey"
        busy={pay.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (payAmount && payAmount <= BigInt(obligation.amount)) pay.mutate(payAmount, { onSettled: () => setAsking(null) });
        }}
      >
        <p>
          Debes <Amount value={obligation.amount} /> por esta deuda. Lo que pagues va directo a {name} en {TOKEN_SYMBOL} y la deuda baja en
          ese monto.
        </p>
        <Field label={`Monto a pagar en ${TOKEN_SYMBOL}`}>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={payText}
              onChange={(event) => setPayText(event.target.value)}
              placeholder={formatAmount(obligation.amount)}
              className="field tabular-nums"
            />
            <Button variant="outline" size="lg" onClick={() => setPayText(formatAmount(obligation.amount))}>
              Todo
            </Button>
          </div>
        </Field>
        {payAmount !== null && payAmount > BigInt(obligation.amount) && <Problem>Es más de lo que debes.</Problem>}
      </Confirm>
    </li>
  );
}

interface RegisterProps {
  /** Called once the debt is on chain. */
  onDone?: () => void;
}

/** Where a business records what another one owes it. */
export function RegisterDebt({ onDone }: RegisterProps) {
  const { me, state } = useNodus();
  const notify = useToast();
  const known: DirectoryMatch[] = state.businesses
    .filter((business) => business.address !== me)
    .map((b) => ({ address: b.address, name: b.name }));
  const [debtor, setDebtor] = useState<DirectoryMatch | null>(null);
  const [amountText, setAmountText] = useState("");
  const [dueText, setDueText] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const amount = parseAmount(amountText);
  const due = dueText ? endOfDay(dueText) : undefined;
  const dueInPast = due !== undefined && daysUntil(due) < 0;

  const register = useAction(
    async () => {
      const reference = referenceText.trim() ? await referenceHash(referenceText) : undefined;
      const id = await registerDebt(me, debtor!.address, amount!, { reference, due });
      if (reference) await post("/api/notes", { obligationId: id.toString(), text: referenceText.trim() }).catch(() => undefined);
    },
    {
      onSuccess: () => {
        notify(`Deuda registrada. Cuando ${debtor?.name ?? "el otro negocio"} la acepte podrá entrar en un círculo.`);
        setAmountText("");
        setDueText("");
        setReferenceText("");
        setDebtor(null);
        onDone?.();
      },
    },
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (debtor && amount && !dueInPast) register.mutate(undefined);
      }}
    >
      <Field label="Quién te debe" hint="Escribe parte de su nombre, o pega su dirección si aún no está en Nodus.">
        <PickBusiness value={debtor} onChange={setDebtor} me={me} known={known} />
      </Field>
      <Field label={`Monto en ${TOKEN_SYMBOL}`} hint="Hasta dos decimales, con coma.">
        <input
          required
          inputMode="decimal"
          placeholder="0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          className="field tabular-nums"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Vence el" hint="Opcional.">
          <input
            type="date"
            min={dateInput(new Date())}
            value={dueText}
            onChange={(event) => setDueText(event.target.value)}
            className="field"
          />
        </Field>
        <Field label="Factura o referencia" hint="Opcional. En la red queda solo su huella; el texto lo ven ustedes dos.">
          <input
            maxLength={120}
            placeholder="Factura 1234"
            value={referenceText}
            onChange={(event) => setReferenceText(event.target.value)}
            className="field"
          />
        </Field>
      </div>
      {dueInPast && <Problem>La fecha de vencimiento ya pasó.</Problem>}
      <Problem>{register.error}</Problem>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Firmas con tu passkey. {debtor ? debtor.name : "El otro negocio"} tendrá que aceptarla para que cuente.
        </p>
        <Button type="submit" size="lg" busy={register.isPending} disabled={!debtor || amount === null || dueInPast}>
          Registrar con passkey
        </Button>
      </div>
    </form>
  );
}
