"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { post } from "@/lib/api";
import { countPending, readBooks, type Books, type Side } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, percent } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useNodus } from "@/lib/nodus";
import { INK } from "@/lib/tones";
import { DebtList, RegisterDebt } from "./debts";
import { Pending } from "./pending";
import { StarGraph, fold } from "./star-graph";
import { Amount, Bloom, Button, Card, Eyebrow, PageHeader, Problem } from "./ui";

/** How each side of the books is worded, and the second bloom behind its star. */
const SIDES = {
  credit: {
    title: "Te deben",
    verb: "te debe",
    whole: "de lo que te deben",
    empty: "Nadie te debe todavía.",
    hint: "Registra más abajo lo que otro negocio te debe y aparecerá aquí.",
    bloom: "var(--color-lavender)",
  },
  debt: {
    title: "Debes",
    verb: "le debes",
    whole: "de lo que debes",
    empty: "No le debes a nadie.",
    hint: "Cuando otro negocio registre que le debes, aparecerá aquí y en tu bandeja.",
    bloom: "var(--color-rose)",
  },
};

/**
 * The home of a business: itself in focus, with the businesses that owe it on
 * one side and the ones it owes on the other, and the books behind the drawing.
 */
export function NetworkView() {
  const { state, me, nameOf, base } = useNodus();
  const [selected, setSelected] = useState<{ side: Side; address: string } | null>(null);
  const faucet = useAction(me, () => post("/api/faucet", { address: me }));

  const books = { credit: readBooks(state, me, "credit", nameOf), debt: readBooks(state, me, "debt", nameOf) };
  const pending = countPending(state, me);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const named = state.businesses.some((business) => business.address === me);
  const inbox = `${base}/bandeja`;

  // A business looked at in a star lights up in the list under it, and the other way round.
  const linked = (side: Side) => ({
    side,
    selected: selected?.side === side ? selected.address : null,
    onSelect: (address: string | null) => setSelected(address === null ? null : { side, address }),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={named ? nameOf(me) : "Tu negocio"}
        title={
          <>
            Red física · <em>empresa en foco</em>
          </>
        }
        aside={
          <div className="lg:text-right">
            <Eyebrow>Saldo en {TOKEN_SYMBOL}</Eyebrow>
            <p className="display mt-2 text-4xl">{balance === null ? "…" : <Amount value={balance} symbol={false} />}</p>
            {state.faucet && (
              <Button variant="quiet" className="mt-1" busy={faucet.isPending} onClick={() => faucet.mutate(undefined)}>
                Obtener {TOKEN_SYMBOL} de prueba
              </Button>
            )}
          </div>
        }
      >
        Tu negocio al centro: a un lado quién te debe, al otro a quién le debes. Cada cuerda es una deuda y su grosor, el monto.
      </PageHeader>
      <Problem>{faucet.error}</Problem>

      {!named && <NameBusiness address={me} />}
      <Pending toAccept={pending.toAccept} toSign={pending.toSign} href={inbox} />

      <section className="grid gap-5 lg:grid-cols-2">
        <Star {...linked("credit")} books={books.credit} focus={nameOf(me)} inbox={inbox} />
        <Star {...linked("debt")} books={books.debt} focus={nameOf(me)} inbox={inbox} />
      </section>

      <NetPosition credit={books.credit.standing} debt={books.debt.standing} />

      <RegisterDebt me={me} businesses={state.businesses} />

      <section className="grid items-start gap-5 lg:grid-cols-2">
        <DebtList title="Te deben" empty={SIDES.credit.empty} {...linked("credit")} obligations={books.credit.obligations} me={me} nameOf={nameOf} />
        <DebtList title="Debes" empty={SIDES.debt.empty} {...linked("debt")} obligations={books.debt.obligations} me={me} nameOf={nameOf} />
      </section>
    </div>
  );
}

interface StarProps {
  side: Side;
  books: Books;
  focus: string;
  selected: string | null;
  onSelect: (address: string | null) => void;
  /** Where circles get signed. */
  inbox: string;
}

/** One side of the books as a star, with its total above and what is being looked at below. */
function Star({ side, books, focus, selected, onSelect, inbox }: StarProps) {
  const ink = INK[side];
  const words = SIDES[side];
  const looking = selected === null ? undefined : fold(books.relations).find((relation) => relation.address === selected);
  const graph = { tone: side, focus, relations: books.relations, selected, onSelect };
  const empty = books.relations.length === 0;

  return (
    <article className="relative isolate flex flex-col overflow-hidden rounded-3xl border border-hairline bg-card">
      <Bloom color={ink.bloom} className="left-1/2 top-[54%] -z-10 size-[86%] -translate-x-1/2 -translate-y-1/2 opacity-70" />
      <Bloom color={words.bloom} className="left-[8%] top-[58%] -z-10 size-[44%] opacity-45" />

      <header className="px-7 pt-7">
        <p className="eyebrow flex items-center gap-2 text-muted">
          <span aria-hidden className={`size-2 rounded-full ${ink.background}`} />
          {words.title}
        </p>
        <p className="display mt-3 text-5xl">
          <Amount value={books.standing} />
        </p>
        <p className="mt-2 text-sm text-muted">
          {books.relations.length === 0
            ? words.empty
            : `${books.relations.length} ${books.relations.length === 1 ? "negocio" : "negocios"}${
                books.pending > 0n ? ` · ${formatAmount(books.pending)} por aceptar` : ""
              }`}
        </p>
      </header>

      {empty ? (
        // With nobody around it, the business in focus needs little room.
        <div className="mx-auto w-full max-w-52">
          <StarGraph {...graph} labels={false} />
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <StarGraph {...graph} />
          </div>
          <div className="sm:hidden">
            <StarGraph {...graph} labels={false} />
          </div>
        </>
      )}

      <footer className="mt-auto flex min-h-16 items-center border-t border-hairline bg-card/75 px-7 py-3.5 text-sm text-body">
        {looking ? (
          <p>
            <span className="font-medium text-ink">{looking.name}</span> {words.verb}{" "}
            <span className="font-medium text-ink tabular-nums">
              {formatAmount(looking.standing + looking.pending)} {TOKEN_SYMBOL}
            </span>
            {books.standing > 0n && looking.standing > 0n && ` · ${percent(looking.standing, books.standing)} % ${words.whole}`}
            {` · ${looking.debts} ${looking.debts === 1 ? "deuda" : "deudas"}`}
            {looking.pending > 0n && ` · ${formatAmount(looking.pending)} por aceptar`}
            {looking.inCircle && (
              <>
                {" · "}
                <Link href={inbox} className="font-medium text-ink underline underline-offset-4">
                  entra en un círculo
                </Link>
              </>
            )}
          </p>
        ) : empty ? (
          <p className="text-[13px] text-muted">{words.hint}</p>
        ) : (
          <Legend side={side} />
        )}
      </footer>
    </article>
  );
}

/** How to read a star, drawn with its own marks. */
function Legend({ side }: { side: Side }) {
  const ink = INK[side];
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-muted">
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 28 12" className="h-3 w-7" aria-hidden>
          <path d="M1 3 H27" strokeWidth={1.5} strokeLinecap="round" className={ink.stroke} />
          <path d="M3 9 H25" strokeWidth={5} strokeLinecap="round" className={ink.stroke} />
        </svg>
        Más gruesa, más monto
      </li>
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 28 12" className="h-3 w-7" aria-hidden>
          <path d="M2 6 H27" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 6" className={ink.stroke} />
        </svg>
        Por aceptar
      </li>
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
          <circle cx="7" cy="7" r="3.6" fill="none" strokeWidth={1.6} className={ink.stroke} />
          <circle cx="7" cy="7" r="6.2" fill="none" strokeWidth={0.9} className={ink.stroke} />
        </svg>
        Entra en un círculo
      </li>
    </ul>
  );
}

/** What the business is owed against what it owes, as one bar. */
function NetPosition({ credit, debt }: { credit: bigint; debt: bigint }) {
  if (credit + debt === 0n) return null;
  const net = credit - debt;
  const share = percent(credit, credit + debt);
  return (
    <Card className="grid items-center gap-x-10 gap-y-5 !py-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <Eyebrow>Posición neta</Eyebrow>
        <p className="display mt-2 text-4xl">
          {net > 0n && "+"}
          <Amount value={net} />
        </p>
      </div>
      <div>
        <div className="flex h-2 gap-0.5" aria-hidden>
          <span className={`rounded-full ${INK.credit.background}`} style={{ width: `${share}%` }} />
          <span className={`rounded-full ${INK.debt.background}`} style={{ width: `${100 - share}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between gap-4 text-[13px] text-muted">
          <span>
            Te deben <span className="font-medium text-ink tabular-nums">{formatAmount(credit)}</span>
          </span>
          <span>
            {net === 0n ? "Lo que te deben y lo que debes se igualan." : net > 0n ? "Te deben más de lo que debes." : "Debes más de lo que te deben."}
          </span>
          <span>
            Debes <span className="font-medium text-ink tabular-nums">{formatAmount(debt)}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

/** An account that entered without a name in the directory gets asked for one. */
function NameBusiness({ address }: { address: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => post("/api/businesses", { address, name: name.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["state"] }),
  });
  return (
    <Card>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-muted">¿Cómo se llama tu negocio? Así te verán los demás.</span>
          <input required minLength={2} maxLength={40} value={name} onChange={(event) => setName(event.target.value)} className="field" />
        </label>
        <Button type="submit" busy={save.isPending} className="!h-11">
          Guardar
        </Button>
      </form>
      <div className="mt-3 empty:hidden">
        <Problem>{save.error?.message}</Problem>
      </div>
    </Card>
  );
}
