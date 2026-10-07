"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptDebt, cancelDebt, rejectDebt } from "@/lib/actions";
import { readInbox } from "@/lib/books";
import { agoInWords, dueInWords } from "@/lib/format";
import { useAction, useOrigin } from "@/lib/hooks";
import { useNodus } from "@/lib/nodus";
import type { CircleView, ObligationView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { Confirm, useToast } from "./overlays";
import { Amount, Avatar, Button, Card, Empty, PageHeader, Problem } from "./ui";

/** Where what needs the business's signature arrives: debts registered against it and circles to settle. */
export function InboxView() {
  const { state, me, role, nameOf, base } = useNodus();
  const inbox = readInbox(state, me);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const circles = [...inbox.toSign, ...inbox.found];
  const underWay = inbox.waiting.length + inbox.awaited.length;
  const wanted = useSearchParams().get("circulo");
  const origin = useOrigin();

  // A circle reached by link scrolls into view.
  useEffect(() => {
    if (!wanted) return;
    document.getElementById(`circulo-${wanted.slice(0, 16)}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [wanted, state.circles.length]);

  const headline =
    circles.length + inbox.toAccept.length === 0
      ? "Nada espera tu firma."
      : [
          circles.length > 0 && `${circles.length} ${circles.length === 1 ? "círculo" : "círculos"}`,
          inbox.toAccept.length > 0 && `${inbox.toAccept.length} ${inbox.toAccept.length === 1 ? "deuda" : "deudas"}`,
        ]
          .filter(Boolean)
          .join(" y ")
          .replace(/^(.)/, (first) => first.toUpperCase()) +
        (circles.length + inbox.toAccept.length === 1 ? " espera tu firma." : " esperan tu firma.");

  const card = (circle: CircleView) => (
    <CircleCard
      key={circle.key}
      circle={circle}
      me={me}
      nameOf={nameOf}
      balance={balance}
      ledger={state.ledger}
      canSign={role === "owner"}
      href={origin ? `${origin}${base}/bandeja?circulo=${circle.key}` : undefined}
      highlighted={wanted === circle.key}
    />
  );

  return (
    <div className="flex flex-col gap-12">
      <PageHeader eyebrow="Bandeja" title={headline}>
        Aquí llega lo que necesita tu firma: las deudas que otros registran a tu nombre y los círculos que Nodus encuentra. Nada se mueve
        sin ella.
      </PageHeader>

      {inbox.settled.length > 0 && <Group title="Recién desanudados">{inbox.settled.map(card)}</Group>}

      {circles.length > 0 && (
        <Group title="Círculos por firmar" count={circles.length}>
          {circles.map(card)}
        </Group>
      )}

      {inbox.toAccept.length > 0 && (
        <Group title="Deudas por aceptar" count={inbox.toAccept.length}>
          {inbox.toAccept.map((obligation) => (
            <DebtToAccept key={obligation.id} obligation={obligation} name={nameOf(obligation.creditor)} />
          ))}
        </Group>
      )}

      {underWay > 0 && (
        <Group title="En curso, esperando a otros">
          {inbox.waiting.map(card)}
          {inbox.awaited.length > 0 && (
            <Card padding="none">
              <ul className="divide-y divide-hairline-soft">
                {inbox.awaited.map((obligation) => (
                  <AwaitedDebt key={obligation.id} obligation={obligation} name={nameOf(obligation.debtor)} />
                ))}
              </ul>
            </Card>
          )}
        </Group>
      )}

      {circles.length + inbox.toAccept.length + underWay + inbox.settled.length === 0 && (
        <Empty tone="free" title="Todo al día">
          Cuando alguien registre una deuda a tu nombre, o tus deudas aceptadas cierren un círculo, aparecerá aquí para que la firmes.
        </Empty>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow flex items-center gap-2.5 text-muted">
        {title}
        {count !== undefined && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-ink tabular-nums">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

interface DebtProps {
  obligation: ObligationView;
  /** The business at the other end of the debt. */
  name: string;
}

/** A debt another business says this one owes it, to accept with a signature. */
function DebtToAccept({ obligation, name }: DebtProps) {
  const notify = useToast();
  const id = BigInt(obligation.id);
  const accept = useAction(() => acceptDebt(id), { onSuccess: () => notify("Deuda aceptada. Ya puede entrar en un círculo.") });
  const reject = useAction(() => rejectDebt(id), { onSuccess: () => notify("Deuda rechazada.") });
  const [rejecting, setRejecting] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Avatar name={name} tone="debt" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-body">
            <span className="font-medium text-ink">{name}</span> registró que le debes
          </p>
          <p className="display mt-1 text-4xl">
            <Amount value={obligation.amount} />
          </p>
          <p className="mt-1 text-caption text-muted">
            {obligation.note ? `${obligation.note} · ` : ""}
            {obligation.dueAt ? `${dueInWords(obligation.dueAt)} · ` : ""}
            registrada {agoInWords(obligation.registeredAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button busy={accept.isPending} disabled={reject.isPending} onClick={() => accept.mutate(undefined)}>
            Aceptar con passkey
          </Button>
          <Button variant="quiet" busy={reject.isPending} disabled={accept.isPending} onClick={() => setRejecting(true)}>
            No la reconozco
          </Button>
        </div>
      </div>
      <p className="border-t border-hairline-soft pt-4 text-sm text-body">
        Al aceptarla reconoces la deuda, y Nodus podrá cancelarla en un círculo con lo que otros te deben. Si no la reconoces, recházala:
        sin tu firma no cuenta.
      </p>
      <Problem>{accept.error ?? reject.error}</Problem>
      <Confirm
        open={rejecting}
        title="¿Rechazar esta deuda?"
        action="Rechazar con passkey"
        busy={reject.isPending}
        onCancel={() => setRejecting(false)}
        onConfirm={() => reject.mutate(undefined, { onSettled: () => setRejecting(false) })}
      >
        {name} registró que le debes <Amount value={obligation.amount} />. Si la rechazas, desaparece; {name} tendría que registrarla de
        nuevo.
      </Confirm>
    </Card>
  );
}

/** A debt this business registered that the other one has not accepted yet. */
function AwaitedDebt({ obligation, name }: DebtProps) {
  const notify = useToast();
  const cancel = useAction(() => cancelDebt(BigInt(obligation.id)), { onSuccess: () => notify("Deuda anulada.") });
  const [cancelling, setCancelling] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
      <Avatar name={name} tone="credit" size="sm" />
      <p className="min-w-0 flex-1 text-body-sm text-body">
        Esperando que <span className="font-medium text-ink">{name}</span> acepte que te debe{" "}
        <span className="font-medium text-ink">
          <Amount value={obligation.amount} />
        </span>
        <span className="text-muted"> · {agoInWords(obligation.registeredAt)}</span>
      </p>
      <Button variant="quiet" busy={cancel.isPending} onClick={() => setCancelling(true)}>
        Anular
      </Button>
      <div className="w-full empty:hidden">
        <Problem>{cancel.error}</Problem>
      </div>
      <Confirm
        open={cancelling}
        title="¿Anular esta deuda?"
        action="Anular con passkey"
        busy={cancel.isPending}
        onCancel={() => setCancelling(false)}
        onConfirm={() => cancel.mutate(undefined, { onSettled: () => setCancelling(false) })}
      >
        {name} dejará de tener esta deuda pendiente contigo. No se puede deshacer.
      </Confirm>
    </li>
  );
}
