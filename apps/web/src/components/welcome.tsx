"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { explain } from "@/lib/actions";
import { SOFTWARE_PASSKEYS } from "@/lib/config";
import { useSession } from "@/lib/session";
import { softwarePasskeys } from "@/lib/software-passkey";
import { INK } from "@/lib/tones";
import type { CircleView } from "@/lib/types";
import { CircleGraph } from "./circle-graph";
import { Bloom, Button, Chip, Eyebrow, Logo, Problem } from "./ui";

/** What someone without a session sees: what Nodus is, and how to get in. */
export function Welcome() {
  const session = useSession();
  const create = useMutation({ mutationFn: (name: string) => session.create(name) });
  const enter = useMutation({ mutationFn: (credentialId?: string) => session.enter(credentialId) });
  const problem = create.error ?? enter.error;

  // This screen only renders in the browser, once the session is known, so storage is there.
  const [testPasskeys] = useState(() => (SOFTWARE_PASSKEYS ? softwarePasskeys() : null));

  return (
    <WelcomeScreen
      onCreate={create.mutate}
      creating={create.isPending}
      onEnter={enter.mutate}
      entering={enter.isPending ? (enter.variables ?? true) : false}
      problem={problem ? explain(problem) : null}
      testPasskeys={testPasskeys}
    />
  );
}

interface ScreenProps {
  onCreate: (name: string) => void;
  creating: boolean;
  onEnter: (credentialId?: string) => void;
  /** The test passkey being entered with, or true while entering with a device passkey. */
  entering: string | boolean;
  problem: string | null;
  /** The keys kept in this browser instead of device passkeys, when the app runs that way. */
  testPasskeys: Array<{ credentialId: string; name: string }> | null;
}

const STEPS = [
  ["Registra", "Anota lo que te deben. Quien te debe lo acepta con su firma."],
  ["Firma", "Nodus detecta el círculo y cada negocio firma solo su parte."],
  ["Liquida", "Una transacción cancela todo y paga los netos, o no pasa nada."],
];

export function WelcomeScreen({ onCreate, creating, onEnter, entering, problem, testPasskeys }: ScreenProps) {
  const [name, setName] = useState("");
  const busy = creating || entering !== false;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Logo className="text-[17px]" />
        <Chip>Red de pruebas de Stellar</Chip>
      </header>

      <main className="grid flex-1 items-center gap-x-14 gap-y-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-16">
        <div>
          <Eyebrow>Compensación de deudas entre pymes</Eyebrow>
          <h1 className="display mt-5 text-5xl text-balance sm:text-[64px]">
            <em>Desanuda</em> las deudas entre negocios.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
            Cuando A le debe a B, B le debe a C y C le debe a A, todos esperan cobrar para poder pagar. Nodus encuentra ese círculo,
            cancela las deudas a la vez y mueve solo el saldo neto.
          </p>

          <form
            className="mt-10 flex max-w-xl flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate(name.trim());
            }}
          >
            <label htmlFor="business" className="text-sm font-medium">
              Crea la cuenta de tu negocio
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="business"
                required
                minLength={2}
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre del negocio"
                className="field min-w-0 flex-1"
              />
              <Button type="submit" busy={creating} disabled={busy} className="!h-11">
                {creating ? "Creando la cuenta…" : "Crear cuenta con passkey"}
              </Button>
            </div>
            <p className="text-sm text-muted">
              Tu passkey es la llave de la cuenta: la guarda tu dispositivo y firmas con tu huella o tu rostro. No hay contraseñas ni
              frases que anotar.
            </p>
          </form>

          <div className="mt-8 flex max-w-xl flex-col gap-3 border-t border-hairline pt-6">
            {testPasskeys ? (
              <>
                <p className="text-sm text-body">
                  <span className="font-medium text-ink">Modo de prueba.</span> Las llaves se guardan en este navegador en vez de ser
                  passkeys del dispositivo. {testPasskeys.length > 0 ? "Entra como:" : "Todavía no hay ninguna: crea una cuenta arriba."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {testPasskeys.map((passkey) => (
                    <Button
                      key={passkey.credentialId}
                      variant="outline"
                      size="sm"
                      busy={entering === passkey.credentialId}
                      disabled={busy}
                      onClick={() => onEnter(passkey.credentialId)}
                    >
                      {passkey.name}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm text-body">¿Tu negocio ya tiene cuenta?</p>
                <Button variant="outline" size="sm" busy={entering === true} disabled={busy} onClick={() => onEnter(undefined)}>
                  Entrar con mi passkey
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 max-w-xl empty:hidden">
            <Problem>{problem}</Problem>
          </div>
        </div>

        <Demonstration />
      </main>

      <ol className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3">
        {STEPS.map(([title, text], index) => (
          <li key={title} className="bg-card px-7 py-6">
            <Eyebrow>Paso {index + 1}</Eyebrow>
            <p className="display mt-3 text-2xl">{title}</p>
            <p className="mt-2 text-[15px] text-body">{text}</p>
          </li>
        ))}
      </ol>

      <footer className="py-8 text-[13px] text-muted">Nodus liquida sobre Stellar. Las cuentas son passkeys y nadie paga comisiones.</footer>
    </div>
  );
}

const [BAKERY, MILL, CARRIER] = ["panaderia", "molino", "fletes"];
const NAMES: Record<string, string> = { [BAKERY]: "Panadería Sur", [MILL]: "Molino Andes", [CARRIER]: "Fletes Ruta 5" };
const UNIT = 10_000_000;
const party = (address: string, owes: number, owed: number, signed: boolean) => ({
  address,
  owesLess: String(owes * UNIT),
  owedLess: String(owed * UNIT),
  net: String((owed - owes) * UNIT),
  signed,
});

/** The circle of the pitch at each moment of its life: found, being signed by one more party each time, settled. */
function moment(step: number): CircleView {
  const signed = (order: number) => step > order;
  return {
    key: "demo",
    clearings: [],
    parties: [party(BAKERY, 100, 90, signed(1)), party(MILL, 80, 100, signed(0)), party(CARRIER, 90, 80, signed(2))],
    edges: [
      { from: BAKERY, to: MILL, amount: String(100 * UNIT) },
      { from: MILL, to: CARRIER, amount: String(80 * UNIT) },
      { from: CARRIER, to: BAKERY, amount: String(90 * UNIT) },
    ],
    cleared: String(270 * UNIT),
    moved: String(20 * UNIT),
    proposal: step === 0 ? undefined : { id: "demo", status: step > 3 ? "settled" : "open", expirationLedger: 0 },
  };
}

const CAPTIONS = [
  "Tres negocios se deben en círculo: 270 en deudas.",
  "Cada uno firma solo su parte.",
  "Cada uno firma solo su parte.",
  "Con la última firma, una sola transacción lo liquida.",
  "270 cancelados moviendo solo 20.",
];
const PACE_MS = [2600, 1300, 1300, 1500, 3400];

/** The idea, playing: a circle of debts gets found, signed and untied, over and over. */
function Demonstration() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const next = setTimeout(() => setStep((step + 1) % CAPTIONS.length), PACE_MS[step]);
    return () => clearTimeout(next);
  }, [step]);

  return (
    <figure className="relative isolate overflow-hidden rounded-3xl border border-hairline bg-canvas-soft">
      <Bloom color={step > 3 ? INK.free.bloom : INK.credit.bloom} className="left-[58%] top-[44%] -z-10 size-[80%] -translate-x-1/2 -translate-y-1/2 opacity-75" />
      <Bloom color={INK.debt.bloom} className="left-[4%] top-[52%] -z-10 size-[52%] opacity-55" />
      <Bloom color={INK.neutral.bloom} className="left-[52%] top-[-8%] -z-10 size-[46%] opacity-50" />
      <div className="flex justify-center px-2 pt-6">
        <CircleGraph circle={moment(step)} me={BAKERY} nameOf={(address) => NAMES[address] ?? ""} />
      </div>
      <figcaption className="flex min-h-16 items-center justify-between gap-4 border-t border-hairline bg-card/75 px-7 py-4 text-sm text-body">
        <span>{CAPTIONS[step]}</span>
        <span className="flex gap-1" aria-hidden>
          {CAPTIONS.map((_, index) => (
            <span key={index} className={`h-1.5 w-4 rounded-full transition-colors ${index === step ? "bg-primary" : "bg-hairline-strong"}`} />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
