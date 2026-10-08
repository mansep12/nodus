"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { acceptDebt, cancelDebt, rejectDebt } from "@/lib/actions";
import { readInbox } from "@/lib/books";
import { agoInWords, dueInWords } from "@/lib/format";
import { useAction, useOrigin } from "@/lib/hooks";
import { EASE } from "@/lib/motion";
import { useNodus } from "@/lib/nodus";
import type { CircleView, ObligationView } from "@/lib/types";
import { CircleCard } from "./circle-card";
import { DebtCord } from "./cord";
import { Confirm, useToast } from "./overlays";
import { Amount, Avatar, Button, Card, Chip, Empty, PageHeader, Problem, Tick } from "./ui";

/** The groups of the inbox a circle can be in. */
type Place = "settled" | "toSign" | "waiting";

/**
 * How long a circle stays where it was once it belongs in another group, so
 * that what happened to it plays where the eye already is: a signature on
 * its way to the next party, the knot letting go.
 */
const STAY_MS: Record<Place, number> = { toSign: 0, waiting: 2_400, settled: 6_000 };
/** How long a debt stays to show that it was accepted, before it leaves. */
const ACCEPTED_MS = 1_800;
/** The space the page leaves between its groups, and a group between its cards. */
const GAP = { groups: 48, cards: 16 };

/** Something kept on screen after it left its list: where it was, and what it came after there. */
interface Kept<Item> {
  item: Item;
  after: string | null;
}

/** Puts back into `list` what is being kept, each after the one it followed, or first if that one is gone. */
function withKept<Item>(list: Item[], kept: Kept<Item>[], keyOf: (item: Item) => string): Item[] {
  const whole = [...list];
  for (const { item, after } of kept) whole.splice(whole.findIndex((other) => keyOf(other) === after) + 1, 0, item);
  return whole;
}

/**
 * Keeps every circle in the group it was in for a moment after the state
 * moves it to another, and for as long as its settlement is on its way.
 * Returns the circles to show in a group.
 */
function useStaying(groups: Record<Place, CircleView[]>) {
  const places = (Object.keys(groups) as Place[]).flatMap((place) => groups[place].map((circle) => ({ key: circle.key, place })));
  const signature = places.map(({ key, place }) => `${key}\t${place}`).join("\n");
  const [seen, setSeen] = useState({ signature, places });
  const [stays, setStays] = useState<Map<string, Kept<Place>>>(() => new Map());
  if (seen.signature !== signature) {
    setSeen({ signature, places });
    const next = new Map<string, Kept<Place>>();
    for (const { key, place } of places) {
      const staying = stays.get(key);
      const index = seen.places.findIndex((before) => before.key === key);
      const was = staying?.item ?? seen.places[index]?.place;
      if (was === undefined || was === place) continue;
      const before = seen.places.slice(0, index).findLast((other) => other.place === was);
      next.set(key, staying ?? { item: was, after: before?.key ?? null });
    }
    setStays(next);
  }

  // A circle being sent stays until it is settled; the rest move on after their moment.
  const leaving = places
    .filter(({ key }) => stays.has(key) && !groups.waiting.some((circle) => circle.key === key && circle.proposal?.status === "submitted"))
    .map(({ key, place }) => `${key}\t${place}`)
    .join("\n");
  useEffect(() => {
    if (!leaving) return;
    const timers = leaving.split("\n").map((entry) => {
      const [key, place] = entry.split("\t") as [string, Place];
      return setTimeout(
        () =>
          setStays((current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
          }),
        STAY_MS[place],
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [leaving]);

  const circleOf = new Map(Object.values(groups).flatMap((circles) => circles.map((circle) => [circle.key, circle] as const)));
  return (place: Place): CircleView[] =>
    withKept(
      groups[place].filter((circle) => !stays.has(circle.key)),
      [...stays].flatMap(([key, stay]) => (stay.item === place ? [{ item: circleOf.get(key)!, after: stay.after }] : [])),
      (circle) => circle.key,
    );
}

/** Where what needs the business's signature arrives: debts registered against it and circles to settle. */
export function InboxView() {
  const { state, me, role, nameOf, base } = useNodus();
  const inbox = readInbox(state, me);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const toSign = inbox.toSign.length + inbox.found.length;
  const wanted = useSearchParams().get("circulo");
  const origin = useOrigin();

  const shown = useStaying({ settled: inbox.settled, toSign: [...inbox.toSign, ...inbox.found], waiting: inbox.waiting });
  const [settled, circles, waiting] = [shown("settled"), shown("toSign"), shown("waiting")];

  // A debt just accepted stays for a moment to show it, and does not come back even if the state is late to say so.
  const [accepted, setAccepted] = useState<Map<string, Kept<ObligationView> & { gone: boolean }>>(() => new Map());
  const toAccept = inbox.toAccept.filter((obligation) => !accepted.has(obligation.id));
  const debts = withKept(
    toAccept,
    [...accepted.values()].filter((kept) => !kept.gone),
    (obligation) => obligation.id,
  );
  const keep = (obligation: ObligationView) => {
    const after = debts[debts.findIndex((other) => other.id === obligation.id) - 1]?.id ?? null;
    setAccepted((current) => new Map(current).set(obligation.id, { item: obligation, after, gone: false }));
    setTimeout(() => setAccepted((current) => new Map(current).set(obligation.id, { item: obligation, after, gone: true })), ACCEPTED_MS);
  };

  // A circle reached by link scrolls into view.
  useEffect(() => {
    if (!wanted) return;
    document.getElementById(`circulo-${wanted.slice(0, 16)}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [wanted, state.circles.length]);

  const headline =
    toSign + toAccept.length === 0
      ? "Nada espera tu firma."
      : [
          toSign > 0 && `${toSign} ${toSign === 1 ? "círculo" : "círculos"}`,
          toAccept.length > 0 && `${toAccept.length} ${toAccept.length === 1 ? "deuda" : "deudas"}`,
        ]
          .filter(Boolean)
          .join(" y ")
          .replace(/^(.)/, (first) => first.toUpperCase()) + (toSign + toAccept.length === 1 ? " espera tu firma." : " esperan tu firma.");

  const card = (circle: CircleView) => (
    <Folding key={circle.key} gap={GAP.cards}>
      <CircleCard
        circle={circle}
        me={me}
        nameOf={nameOf}
        balance={balance}
        ledger={state.ledger}
        canSign={role === "owner"}
        href={origin ? `${origin}${base}/bandeja?circulo=${circle.key}` : undefined}
        highlighted={wanted === circle.key}
        settlement={state.settlements.find((settlement) => settlement.txHash === circle.proposal?.txHash)}
      />
    </Folding>
  );

  return (
    <div className="flex flex-col gap-12">
      <PageHeader eyebrow="Bandeja" title={headline}>
        Aquí llega lo que necesita tu firma: las deudas que otros registran a tu nombre y los círculos que Nodus encuentra. Nada se mueve
        sin ella.
      </PageHeader>

      <AnimatePresence initial={false}>
        {settled.length > 0 && (
          <Folding key="settled" gap={GAP.groups}>
            <Group title="Recién desanudados">{settled.map(card)}</Group>
          </Folding>
        )}

        {circles.length > 0 && (
          <Folding key="toSign" gap={GAP.groups}>
            <Group title="Círculos por firmar" count={toSign || undefined}>
              {circles.map(card)}
            </Group>
          </Folding>
        )}

        {debts.length > 0 && (
          <Folding key="toAccept" gap={GAP.groups}>
            <Group title="Deudas por aceptar" count={toAccept.length || undefined}>
              {debts.map((obligation) => (
                <Folding key={obligation.id} gap={GAP.cards}>
                  <DebtToAccept obligation={obligation} name={nameOf(obligation.creditor)} onAccepted={() => keep(obligation)} />
                </Folding>
              ))}
            </Group>
          </Folding>
        )}

        {waiting.length + inbox.awaited.length > 0 && (
          <Folding key="waiting" gap={GAP.groups}>
            <Group
              title="En curso, esperando a otros"
              after={
                inbox.awaited.length > 0 && (
                  <Card padding="none">
                    <ul className="divide-y divide-hairline-soft">
                      {inbox.awaited.map((obligation) => (
                        <AwaitedDebt key={obligation.id} obligation={obligation} name={nameOf(obligation.debtor)} />
                      ))}
                    </ul>
                  </Card>
                )
              }
            >
              {waiting.map(card)}
            </Group>
          </Folding>
        )}
      </AnimatePresence>

      {settled.length + circles.length + debts.length + waiting.length + inbox.awaited.length === 0 && (
        <Empty tone="free" title="Todo al día">
          Cuando alguien registre una deuda a tu nombre, o tus deudas aceptadas cierren un círculo, aparecerá aquí para que la firmes.
        </Empty>
      )}
    </div>
  );
}

/**
 * One of a list that unfolds as it comes and folds away as it goes, so that
 * the rest makes room for it without a jump. `gap` is the space the list
 * leaves between its items.
 */
function Folding({ gap, children }: { gap: number; children: ReactNode }) {
  const folded = { opacity: 0, height: 0, marginBottom: -gap, overflow: "hidden" };
  return (
    <motion.div
      initial={folded}
      animate={{ opacity: 1, height: "auto", marginBottom: 0, transitionEnd: { overflow: "visible" } }}
      exit={folded}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

interface GroupProps {
  title: string;
  count?: number;
  /** The cards of the group, which come and go. */
  children: ReactNode;
  /** What closes the group and is not a card. */
  after?: ReactNode;
}

function Group({ title, count, children, after }: GroupProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow flex items-center gap-2.5 text-muted">
        {title}
        {count !== undefined && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-ink tabular-nums">{count}</span>}
      </h2>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
      {after}
    </section>
  );
}

interface DebtProps {
  obligation: ObligationView;
  /** The business at the other end of the debt. */
  name: string;
}

/** A debt another business says this one owes it, to accept with a signature. */
function DebtToAccept({ obligation, name, onAccepted }: DebtProps & { onAccepted: () => void }) {
  const { me, nameOf } = useNodus();
  const notify = useToast();
  const id = BigInt(obligation.id);
  // Accepted as soon as the chain says so; the card says it itself, where the eye is, and then leaves.
  const [accepted, setAccepted] = useState(false);
  const accept = useAction(() => acceptDebt(id), {
    onSuccess: () => {
      setAccepted(true);
      onAccepted();
    },
  });
  const reject = useAction(() => rejectDebt(id), { onSuccess: () => notify("Deuda rechazada.") });
  const [rejecting, setRejecting] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <DebtCord debtor={nameOf(me)} creditor={name} accepted={accepted} />
        <div className="min-w-0 flex-1 basis-52">
          <p className="text-body-sm text-body">
            <span className="font-medium text-ink">{name}</span> registró que le debes
          </p>
          {/* Until it is accepted the amount is written as lightly as the cord is drawn. */}
          <p className={`display mt-1 text-4xl transition-colors duration-500 ${accepted ? "text-ink" : "text-muted"}`}>
            <Amount value={obligation.amount} />
          </p>
          <p className="mt-1 text-caption text-muted">
            {obligation.note ? `${obligation.note} · ` : ""}
            {obligation.dueAt ? `${dueInWords(obligation.dueAt)} · ` : ""}
            registrada {agoInWords(obligation.registeredAt)}
          </p>
        </div>
        <div className="relative">
          <div className={`flex flex-col items-end gap-2 ${accepted ? "invisible" : ""}`}>
            <Button busy={accept.isPending} disabled={reject.isPending} onClick={() => accept.mutate(undefined)}>
              Aceptar con passkey
            </Button>
            <Button variant="quiet" busy={reject.isPending} disabled={accept.isPending} onClick={() => setRejecting(true)}>
              No la reconozco
            </Button>
          </div>
          {accepted && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
              className="absolute inset-0 grid place-items-center"
            >
              <Chip tone="free">
                <Tick className="size-3 stroke-current" />
                Aceptada
              </Chip>
            </motion.div>
          )}
        </div>
      </div>
      <p role="status" className="border-t border-hairline-soft pt-4 text-sm text-body">
        {accepted
          ? "Deuda aceptada. Ya puede entrar en un círculo con lo que otros te deben."
          : "Al aceptarla reconoces la deuda, y Nodus podrá cancelarla en un círculo con lo que otros te deben. Si no la reconoces, recházala: sin tu firma no cuenta."}
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
