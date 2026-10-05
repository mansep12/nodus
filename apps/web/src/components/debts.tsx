"use client";

import { useState } from "react";
import { acceptDebt, cancelDebt, registerDebt } from "@/lib/actions";
import { TOKEN_SYMBOL } from "@/lib/config";
import { parseAmount } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { BusinessView, ObligationView } from "@/lib/types";
import { Amount, Button, Card, Chip, Problem } from "./ui";

interface ListProps {
  title: string;
  empty: string;
  obligations: ObligationView[];
  me: string;
  nameOf: (address: string) => string;
}

const active = (obligation: ObligationView) => obligation.status === "pending" || obligation.status === "accepted";

/** The debts on one side of a business: what it is owed, or what it owes. */
export function DebtList({ title, empty, obligations, me, nameOf }: ListProps) {
  // What still counts comes first; settled and withdrawn debts follow.
  const sorted = [...obligations].sort((a, b) => Number(active(b)) - Number(active(a)) || Number(BigInt(b.id) - BigInt(a.id)));
  return (
    <Card>
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {sorted.map((obligation) => (
            <DebtRow key={obligation.id} obligation={obligation} me={me} nameOf={nameOf} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DebtRow({ obligation, me, nameOf }: { obligation: ObligationView; me: string; nameOf: (address: string) => string }) {
  const id = BigInt(obligation.id);
  const accept = useAction(me, () => acceptDebt(id));
  const cancel = useAction(me, () => cancelDebt(id));
  const iAmCreditor = obligation.creditor === me;
  const partlySettled = obligation.status === "accepted" && obligation.amount !== obligation.originalAmount;

  return (
    <li className={`py-4 ${active(obligation) ? "" : "opacity-55"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{nameOf(iAmCreditor ? obligation.debtor : obligation.creditor)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {obligation.status === "pending" && <Chip tone="debt">{iAmCreditor ? "Esperando que acepte" : "Por aceptar"}</Chip>}
            {obligation.status === "accepted" && <Chip>{partlySettled ? "Vigente, compensada en parte" : "Vigente"}</Chip>}
            {obligation.status === "settled" && <Chip tone="free">Compensada</Chip>}
            {obligation.status === "cancelled" && <Chip>Anulada</Chip>}
            <span>Deuda n.º {obligation.id}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">
            <Amount value={active(obligation) ? obligation.amount : obligation.originalAmount} />
          </p>
          <div className="mt-1 flex justify-end gap-4">
            {obligation.status === "pending" && !iAmCreditor && (
              <Button variant="secondary" className="!px-4 !py-1.5" busy={accept.isPending} onClick={() => accept.mutate(undefined)}>
                Aceptar
              </Button>
            )}
            {active(obligation) && iAmCreditor && (
              <Button variant="quiet" busy={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
                Anular
              </Button>
            )}
          </div>
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
    <Card>
      <h3 className="text-lg font-semibold tracking-tight">Registrar una deuda a cobrar</h3>
      <p className="mt-1 text-sm text-muted">
        Anota lo que otro negocio te debe. Cuando ese negocio la acepte, la deuda podrá entrar en un círculo.
      </p>
      {others.length === 0 ? (
        <p className="mt-5 text-sm text-muted">Todavía no hay otros negocios en Nodus a quienes cobrarles.</p>
      ) : (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate(undefined);
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="text-muted">Quién te debe</span>
            <select
              required
              value={debtor}
              onChange={(event) => setDebtor(event.target.value)}
              className="h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink"
            >
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
          <label className="flex flex-col gap-1.5 text-sm sm:w-44">
            <span className="text-muted">Monto en {TOKEN_SYMBOL}</span>
            <input
              required
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className="h-11 rounded-xl border border-line bg-surface px-3 tabular-nums outline-none focus:border-ink"
            />
          </label>
          <Button type="submit" busy={register.isPending} disabled={!debtor || amount === null} className="h-11">
            Registrar
          </Button>
        </form>
      )}
      <div className="mt-3 empty:hidden">
        <Problem>{register.error}</Problem>
      </div>
    </Card>
  );
}
