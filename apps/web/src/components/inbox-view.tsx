"use client";

import { acceptDebt, cancelDebt } from "@/lib/actions";
import { readInbox } from "@/lib/books";
import { useAction } from "@/lib/hooks";
import { useNodus } from "@/lib/nodus";
import type { CircleView, ObligationView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { Amount, Avatar, Button, Card, Empty, Eyebrow, PageHeader, Problem } from "./ui";

const HEADLINES = ["Nada espera tu firma.", "Una cosa espera tu firma."];

/** Where what needs the business's signature arrives: debts registered against it and circles to settle. */
export function InboxView() {
  const { state, me, nameOf } = useNodus();
  const inbox = readInbox(state, me);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const circles = [...inbox.toSign, ...inbox.found];
  const mine = circles.length + inbox.toAccept.length;
  const underWay = inbox.waiting.length + inbox.awaited.length;

  const card = (circle: CircleView) => (
    <CircleCard key={circle.key} circle={circle} me={me} nameOf={nameOf} balance={balance} ledger={state.ledger} />
  );

  return (
    <div className="flex flex-col gap-12">
      <PageHeader eyebrow="Bandeja" title={HEADLINES[mine] ?? `${mine} cosas esperan tu firma.`}>
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
            <DebtToAccept key={obligation.id} obligation={obligation} me={me} name={nameOf(obligation.creditor)} />
          ))}
        </Group>
      )}

      {underWay > 0 && (
        <Group title="En curso, esperando a otros">
          {inbox.waiting.map(card)}
          {inbox.awaited.length > 0 && (
            <Card className="!p-0">
              <ul className="divide-y divide-hairline-soft">
                {inbox.awaited.map((obligation) => (
                  <AwaitedDebt key={obligation.id} obligation={obligation} me={me} name={nameOf(obligation.debtor)} />
                ))}
              </ul>
            </Card>
          )}
        </Group>
      )}

      {mine + underWay + inbox.settled.length === 0 && (
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
      <Eyebrow className="flex items-center gap-2.5">
        {title}
        {count !== undefined && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-ink tabular-nums">{count}</span>}
      </Eyebrow>
      {children}
    </section>
  );
}

interface DebtProps {
  obligation: ObligationView;
  me: string;
  /** The business at the other end of the debt. */
  name: string;
}

/** A debt another business says this one owes it, to accept with a signature. */
function DebtToAccept({ obligation, me, name }: DebtProps) {
  const accept = useAction(me, () => acceptDebt(BigInt(obligation.id)));
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Avatar name={name} tone="debt" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-body">
            <span className="font-medium text-ink">{name}</span> registró que le debes
          </p>
          <p className="display mt-1 text-4xl">
            <Amount value={obligation.amount} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button busy={accept.isPending} onClick={() => accept.mutate(undefined)}>
            Aceptar con passkey
          </Button>
          <p className="text-[13px] text-muted">Deuda n.º {obligation.id}</p>
        </div>
      </div>
      <p className="border-t border-hairline-soft pt-4 text-sm text-body">
        Al aceptarla reconoces la deuda, y Nodus podrá cancelarla en un círculo con lo que otros te deben. Si no la reconoces, no la
        aceptes: sin tu firma no cuenta.
      </p>
      <Problem>{accept.error}</Problem>
    </Card>
  );
}

/** A debt this business registered that the other one has not accepted yet. */
function AwaitedDebt({ obligation, me, name }: DebtProps) {
  const cancel = useAction(me, () => cancelDebt(BigInt(obligation.id)));
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
      <Avatar name={name} tone="credit" size="sm" />
      <p className="min-w-0 flex-1 text-[15px] text-body">
        Esperando que <span className="font-medium text-ink">{name}</span> acepte que te debe{" "}
        <span className="font-medium text-ink">
          <Amount value={obligation.amount} />
        </span>
      </p>
      <Button variant="quiet" busy={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
        Anular
      </Button>
      <div className="w-full empty:hidden">
        <Problem>{cancel.error}</Problem>
      </div>
    </li>
  );
}
