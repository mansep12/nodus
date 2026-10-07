"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { post } from "@/lib/api";
import { countPending, readBooks, type Books, type Side } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { formatAmount, percent } from "@/lib/format";
import { STATE_KEY, useAction, useMediaQuery } from "@/lib/hooks";
import { useNodus } from "@/lib/nodus";
import { INK } from "@/lib/tones";
import { DebtList, RegisterDebt } from "./debts";
import { Sheet, useToast } from "./overlays";
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
    hint: "Registra lo que otro negocio te debe y aparecerá aquí.",
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
  const { state, me, role, nameOf, base } = useNodus();
  const notify = useToast();
  const [selected, setSelected] = useState<{ side: Side; address: string } | null>(null);
  const [registering, setRegistering] = useState(false);
  const faucet = useAction(() => post("/api/faucet", {}), { onSuccess: () => notify(`Llegaron 1.000 ${TOKEN_SYMBOL} de prueba.`) });

  const books = { credit: readBooks(state, me, "credit", nameOf), debt: readBooks(state, me, "debt", nameOf) };
  const pending = countPending(state, me);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const inbox = `${base}/bandeja`;
  const nothingYet = state.obligations.length === 0;

  // A business looked at in a star lights up in the list under it, and the other way round.
  const linked = (side: Side) => ({
    side,
    selected: selected?.side === side ? selected.address : null,
    onSelect: (address: string | null) => setSelected(address === null ? null : { side, address }),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={state.me.name ?? "Tu negocio"}
        title={
          <>
            Lo que te deben, <em>lo que debes</em>.
          </>
        }
        aside={
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="lg:text-right">
              <Eyebrow>Saldo en {TOKEN_SYMBOL}</Eyebrow>
              <p className="display mt-2 text-4xl">{balance === null ? "…" : <Amount value={balance} symbol={false} />}</p>
              {state.faucet && role === "owner" && (
                <Button variant="quiet" className="mt-1" busy={faucet.isPending} onClick={() => faucet.mutate(undefined)}>
                  Obtener {TOKEN_SYMBOL} de prueba
                </Button>
              )}
            </div>
            <Button size="lg" onClick={() => setRegistering(true)}>
              Registrar una deuda
            </Button>
          </div>
        }
      >
        Tu negocio al centro: a un lado quién te debe, al otro a quién le debes. Cada cuerda es una deuda y su grosor, el monto. Cuando las
        deudas cierran un círculo, Nodus te avisa en la bandeja.
      </PageHeader>
      <Problem>{faucet.error}</Problem>

      {state.me.name === null && role === "owner" && <NameBusiness />}
      <Pending toAccept={pending.toAccept} toSign={pending.toSign} href={inbox} />

      {nothingYet && (
        <Card className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="max-w-xl">
            <h2 className="display text-2xl">Empieza por lo que te deben.</h2>
            <p className="mt-2 text-body-sm text-body">
              Registra una deuda de un cliente o pídele a un proveedor que registre la tuya. Para que otro negocio te encuentre, comparte tu
              dirección: está arriba, junto a tu nombre.
            </p>
          </div>
          <Button size="lg" onClick={() => setRegistering(true)}>
            Registrar una deuda
          </Button>
        </Card>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <Star {...linked("credit")} books={books.credit} focus={nameOf(me)} inbox={inbox} />
        <Star {...linked("debt")} books={books.debt} focus={nameOf(me)} inbox={inbox} />
      </section>

      <NetPosition credit={books.credit.standing} debt={books.debt.standing} />

      <section className="grid items-start gap-5 lg:grid-cols-2">
        <DebtList title="Te deben" empty={SIDES.credit.empty} {...linked("credit")} obligations={books.credit.obligations} />
        <DebtList title="Debes" empty={SIDES.debt.empty} {...linked("debt")} obligations={books.debt.obligations} />
      </section>

      <Sheet
        open={registering}
        onClose={() => setRegistering(false)}
        title="Registrar una deuda a cobrar"
        description="Anota lo que otro negocio te debe. Cuando ese negocio la acepte, la deuda podrá entrar en un círculo."
      >
        <RegisterDebt onDone={() => setRegistering(false)} />
      </Sheet>
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
  const wide = useMediaQuery("(min-width: 640px)");
  const looking = selected === null ? undefined : fold(books.relations).find((relation) => relation.address === selected);
  const graph = { tone: side, focus, relations: books.relations, selected, onSelect };
  const empty = books.relations.length === 0;

  return (
    <article className="relative isolate flex flex-col overflow-hidden rounded-3xl border border-hairline bg-card">
      <Bloom color={ink.bloom} className="left-1/2 top-[54%] -z-10 size-[86%] -translate-x-1/2 -translate-y-1/2 opacity-70" />
      <Bloom color={words.bloom} className="left-[8%] top-[58%] -z-10 size-[44%] opacity-45" />

      <header className="px-7 pt-7">
        <h2 className="eyebrow flex items-center gap-2 text-muted">
          <span aria-hidden className={`size-2 rounded-full ${ink.background}`} />
          {words.title}
        </h2>
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
        <StarGraph {...graph} labels={wide} />
      )}

      {!wide && !empty && (
        // On a phone the names do not fit beside the leaves, so they go in a list.
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-7 pb-3 text-caption text-body">
          {fold(books.relations).map((relation) => (
            <li key={relation.address} className={selected === relation.address ? "font-medium text-ink" : ""}>
              {relation.name} <span className="tabular-nums text-muted">{formatAmount(relation.standing + relation.pending)}</span>
            </li>
          ))}
        </ul>
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
          <p className="text-caption text-muted">{words.hint}</p>
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
    <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-caption text-muted">
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
        <div className="mt-2.5 flex justify-between gap-4 text-caption text-muted">
          <span>
            Te deben <span className="font-medium text-ink tabular-nums">{formatAmount(credit)}</span>
          </span>
          <span>
            {net === 0n
              ? "Lo que te deben y lo que debes se igualan."
              : net > 0n
                ? "Te deben más de lo que debes."
                : "Debes más de lo que te deben."}
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
function NameBusiness() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => post<{ warning?: string }>("/api/businesses", { name: name.trim() }),
    onSuccess: (result) => {
      notify(result.warning ?? "Nombre guardado.", result.warning ? "problem" : "done");
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
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
        <Button type="submit" size="lg" busy={save.isPending}>
          Guardar
        </Button>
      </form>
      <div className="mt-3 empty:hidden">
        <Problem>{save.error?.message}</Problem>
      </div>
    </Card>
  );
}
