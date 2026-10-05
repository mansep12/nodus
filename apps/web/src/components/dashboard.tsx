"use client";

import { EXPLORER_URL } from "@nodus/stellar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { post } from "@/lib/api";
import { TOKEN_SYMBOL } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { useAction, useNodusState } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { CircleCard } from "./circle-card";
import { DebtList, RegisterDebt } from "./debts";
import { History } from "./history";
import { Pending } from "./pending";
import { Amount, Button, Card, Logo, Problem } from "./ui";

const sum = (amounts: string[]) => amounts.reduce((total, amount) => total + BigInt(amount), 0n);

/** The home of a business: its circles, its debts and what has been settled. */
export function Dashboard({ address }: { address: string }) {
  const { leave } = useSession();
  const { data: state, error } = useNodusState(address);
  const faucet = useAction(address, () => post("/api/faucet", { address }));

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-muted">
        {error ? <Problem>{error.message}</Problem> : "Leyendo las deudas…"}
      </main>
    );
  }

  const names = new Map(state.businesses.map((business) => [business.address, business.name]));
  const nameOf = (other: string) => names.get(other) ?? shortAddress(other);
  const balance = state.balance === null ? null : BigInt(state.balance);
  const owedToMe = state.obligations.filter((obligation) => obligation.creditor === address);
  const owedByMe = state.obligations.filter((obligation) => obligation.debtor === address);
  const standing = (obligations: typeof owedToMe) =>
    sum(obligations.filter((obligation) => obligation.status === "accepted").map((obligation) => obligation.amount));

  // What is waiting on this business.
  const toAccept = owedByMe.filter((obligation) => obligation.status === "pending").length;
  const toSign = state.circles.filter(
    (circle) => circle.proposal?.status === "open" && circle.parties.some((party) => party.address === address && !party.signed),
  ).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo className="text-xl" />
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="font-medium">{nameOf(address)}</p>
            <p className="font-mono text-xs text-muted">{shortAddress(address)}</p>
          </div>
          <Button variant="quiet" onClick={() => leave()}>
            Salir
          </Button>
        </div>
      </header>

      {!names.has(address) && <NameBusiness address={address} />}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Figure label="Te deben" value={standing(owedToMe)} />
        <Figure label="Debes" value={standing(owedByMe)} />
        <Figure label={`Saldo en ${TOKEN_SYMBOL}`} value={balance} className="col-span-2 sm:col-span-1">
          {state.faucet && (
            <Button variant="quiet" busy={faucet.isPending} onClick={() => faucet.mutate(undefined)}>
              Obtener {TOKEN_SYMBOL} de prueba
            </Button>
          )}
        </Figure>
      </section>
      <Problem>{faucet.error}</Problem>

      <Pending toAccept={toAccept} toSign={toSign} />

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Círculos</h2>
        {state.circles.length === 0 ? (
          <Card className="text-muted">
            Todavía no hay círculos. Cuando las deudas aceptadas se cierren en un círculo, aparecerá aquí para que cada
            negocio firme su parte.
          </Card>
        ) : (
          state.circles.map((circle) => (
            <CircleCard
              key={circle.proposal?.id ?? circle.key}
              circle={circle}
              me={address}
              nameOf={nameOf}
              balance={balance}
              ledger={state.ledger}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Deudas</h2>
        <RegisterDebt me={address} businesses={state.businesses} />
        <div className="grid gap-4 lg:grid-cols-2">
          <DebtList title="Te deben" empty="Nadie te debe todavía." obligations={owedToMe} me={address} nameOf={nameOf} />
          <DebtList title="Debes" empty="No le debes a nadie." obligations={owedByMe} me={address} nameOf={nameOf} />
        </div>
      </section>

      <History settlements={state.settlements} me={address} nameOf={nameOf} />

      <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-6 text-xs text-muted">
        <span>Red de pruebas de Stellar</span>
        <ExplorerLink label="Contrato de Nodus" contract={state.contract} />
        <ExplorerLink label={`Token ${TOKEN_SYMBOL} de prueba`} contract={state.token} />
      </footer>
    </div>
  );
}

/** Where anyone can check on the network what the app says. */
function ExplorerLink({ label, contract }: { label: string; contract: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/contract/${contract}`}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4 hover:text-ink"
    >
      {label} <span className="font-mono">{shortAddress(contract)}</span>
    </a>
  );
}

interface FigureProps {
  label: string;
  value: bigint | null;
  className?: string;
  children?: React.ReactNode;
}

function Figure({ label, value, className = "", children }: FigureProps) {
  return (
    <Card className={`!p-6 ${className}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value === null ? "…" : <Amount value={value} symbol={false} />}</p>
      <div className="mt-2 empty:hidden">{children}</div>
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
          <input
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink"
          />
        </label>
        <Button type="submit" busy={save.isPending} className="h-11">
          Guardar
        </Button>
      </form>
      <div className="mt-3 empty:hidden">
        <Problem>{save.error?.message}</Problem>
      </div>
    </Card>
  );
}
