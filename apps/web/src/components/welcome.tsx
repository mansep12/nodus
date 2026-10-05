"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { explain } from "@/lib/actions";
import { SOFTWARE_PASSKEYS } from "@/lib/config";
import { useSession } from "@/lib/session";
import { softwarePasskeys } from "@/lib/software-passkey";
import { Button, Card, Logo, Problem } from "./ui";

/** What someone without a session sees: what Nodus is, and how to get in. */
export function Welcome() {
  const session = useSession();
  const [name, setName] = useState("");
  const create = useMutation({ mutationFn: () => session.create(name.trim()) });
  const enter = useMutation({ mutationFn: (credentialId?: string) => session.enter(credentialId) });
  const problem = create.error ?? enter.error;

  // This screen only renders in the browser, once the session is known, so storage is there.
  const [testPasskeys] = useState(() => (SOFTWARE_PASSKEYS ? softwarePasskeys() : []));

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl content-center items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <Logo className="text-xl" />
        <h1 className="mt-10 text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
          Desanuda las deudas entre negocios.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Cuando A le debe a B, B le debe a C y C le debe a A, todos esperan cobrar para poder pagar. Nodus encuentra
          ese círculo, cancela las deudas a la vez y mueve solo el saldo neto.
        </p>
        <ol className="mt-10 grid max-w-xl gap-4 text-sm sm:grid-cols-3">
          {[
            ["Registra", "Anota lo que te deben. Quien te debe lo acepta con su firma."],
            ["Firma", "Nodus detecta el círculo y cada negocio firma solo su parte."],
            ["Liquida", "Una transacción cancela todo y paga los netos, o no pasa nada."],
          ].map(([title, text], index) => (
            <li key={title} className="border-t border-ink/15 pt-3">
              <p className="font-mono text-xs text-debt">0{index + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>

      <Card className="flex flex-col gap-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Crea la cuenta de tu negocio</h2>
            <p className="mt-1 text-sm text-muted">
              Tu passkey es la llave de la cuenta: la guarda tu dispositivo y firmas con tu huella o tu rostro. No hay
              contraseñas ni frases que anotar.
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Nombre del negocio</span>
            <input
              required
              minLength={2}
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Panadería Sur"
              className="h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink"
            />
          </label>
          <Button type="submit" busy={create.isPending} disabled={enter.isPending}>
            {create.isPending ? "Creando la cuenta…" : "Crear cuenta con passkey"}
          </Button>
        </form>

        <div className="flex flex-col gap-3 border-t border-line pt-6">
          <p className="text-sm text-muted">¿Tu negocio ya tiene cuenta?</p>
          {SOFTWARE_PASSKEYS ? (
            <>
              <p className="rounded-2xl bg-debt-soft px-4 py-3 text-xs text-debt">
                Modo de prueba: las llaves se guardan en este navegador en vez de ser passkeys del dispositivo.
              </p>
              <div className="flex flex-wrap gap-2">
                {testPasskeys.map((passkey) => (
                  <Button
                    key={passkey.credentialId}
                    variant="secondary"
                    busy={enter.isPending && enter.variables === passkey.credentialId}
                    disabled={create.isPending || enter.isPending}
                    onClick={() => enter.mutate(passkey.credentialId)}
                  >
                    {passkey.name}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <Button variant="secondary" busy={enter.isPending} disabled={create.isPending} onClick={() => enter.mutate(undefined)}>
              Entrar con mi passkey
            </Button>
          )}
        </div>

        <Problem>{problem && explain(problem)}</Problem>
      </Card>
    </main>
  );
}
