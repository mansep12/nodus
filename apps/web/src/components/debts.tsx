"use client";

import { useState } from "react";
import { acceptDebt, cancelDebt, registerDebt } from "@/lib/actions";
import { isOpen, type Side } from "@/lib/books";
import { TOKEN_SYMBOL } from "@/lib/config";
import { parseAmount } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { BusinessView, ObligationView } from "@/lib/types";
import { Amount, Avatar, Button, Card, Chip, Problem } from "./ui";

interface ListProps {
  title: string;
  empty: string;
  /** The side of the books these debts are on. */
  side: Side;
  obligations: ObligationView[];
  me: string;
  nameOf: (address: string) => string;
  /** The other business being looked at, here or in the drawing above. */
  selected?: string | null;
  onSelect?: (address: string | null) => void;
}

/** The debts on one side of a business: what it is owed, or what it owes. */
export function DebtList({ title, empty, side, obligations, me, nameOf, selected = null, onSelect }: ListProps) {
  // What still counts comes first; settled and withdrawn debts follow.
  const sorted = [...obligations].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || Number(BigInt(b.id) - BigInt(a.id)));
  return (
    <Card className="!p-0">
      <h3 className="flex items-baseline justify-between px-6 pt-5 text-lg font-medium">
        {title}
        <span className="text-sm font-normal text-muted">
          {sorted.filter(isOpen).length} {sorted.filter(isOpen).length === 1 ? "vigente" : "vigentes"}
        </span>
      </h3>
      {sorted.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-[15px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline-soft pb-2">
          {sorted.map((obligation) => {
            const other = side === "credit" ? obligation.debtor : obligation.creditor;
            return (
              <DebtRow
                key={obligation.id}
                obligation={obligation}
                side={side}
                me={me}
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
  me: string;
  /** The business at the other end of the debt. */
  name: string;
  highlighted: boolean;
  onHover: (inside: boolean) => void;
}

function DebtRow({ obligation, side, me, name, highlighted, onHover }: RowProps) {
  const id = BigInt(obligation.id);
  const accept = useAction(me, () => acceptDebt(id));
  const cancel = useAction(me, () => cancelDebt(id));
  const iAmCreditor = side === "credit";
  const open = isOpen(obligation);
  const partlySettled = obligation.status === "accepted" && obligation.amount !== obligation.originalAmount;

  return (
    <li
      className={`group px-6 py-3.5 transition-colors ${highlighted ? "bg-canvas-soft" : ""} ${open ? "" : "opacity-50"}`}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <div className="flex items-center gap-3.5">
        <Avatar name={name} size="sm" tone={open ? side : "neutral"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {obligation.status === "pending" && <Chip tone={side}>{iAmCreditor ? "Esperando que acepte" : "Por aceptar"}</Chip>}
            {obligation.status === "accepted" && <Chip>{partlySettled ? "Vigente, compensada en parte" : "Vigente"}</Chip>}
            {obligation.status === "settled" && <Chip tone="free">Compensada</Chip>}
            {obligation.status === "cancelled" && <Chip>Anulada</Chip>}
            <span>Deuda n.º {obligation.id}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-lg font-medium">
            <Amount value={open ? obligation.amount : obligation.originalAmount} />
          </p>
          {obligation.status === "pending" && !iAmCreditor && (
            <Button variant="outline" size="sm" busy={accept.isPending} onClick={() => accept.mutate(undefined)}>
              Aceptar
            </Button>
          )}
          {open && iAmCreditor && (
            <Button
              variant="quiet"
              className="!text-[13px] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
              busy={cancel.isPending}
              onClick={() => cancel.mutate(undefined)}
            >
              Anular
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 empty:hidden">
        <Problem>{accept.error ?? cancel.error}</Problem>
      </div>
    </li>
  );
}

/** Where a business records what another one owes it. */
export function RegisterDebt({ me, businesses }: { me: string; businesses: BusinessView[] }) {
  const others = businesses.filter((business) => business.address !== me);
  const [debtor, setDebtor] = useState("");
  const [amountText, setAmountText] = useState("");
  const amount = parseAmount(amountText);
  const register = useAction(me, async () => {
    await registerDebt(me, debtor, amount!);
    setAmountText("");
  });

  return (
    <Card className="grid items-end gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div>
        <h3 className="display text-2xl">Registrar una deuda a cobrar</h3>
        <p className="mt-2 text-[15px] text-body">
          Anota lo que otro negocio te debe. Cuando ese negocio la acepte, la deuda podrá entrar en un círculo.
        </p>
      </div>
      {others.length === 0 ? (
        <p className="text-[15px] text-muted">Todavía no hay otros negocios en Nodus a quienes cobrarles.</p>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate(undefined);
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="text-muted">Quién te debe</span>
            <select required value={debtor} onChange={(event) => setDebtor(event.target.value)} className="field">
              <option value="" disabled>
                Elige un negocio
              </option>
              {others.map((business) => (
                <option key={business.address} value={business.address}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:w-40">
            <span className="text-muted">Monto en {TOKEN_SYMBOL}</span>
            <input
              required
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className="field tabular-nums"
            />
          </label>
          <Button type="submit" busy={register.isPending} disabled={!debtor || amount === null} className="!h-11">
            Registrar
          </Button>
        </form>
      )}
      <div className="empty:hidden lg:col-span-2">
        <Problem>{register.error}</Problem>
      </div>
    </Card>
  );
}
