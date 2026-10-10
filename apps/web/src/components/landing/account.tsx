"use client";

import { useState } from "react";
import { Button, Problem } from "../ui";

/** Where the links of the page that say "create an account" point. */
export const FORM_ID = "crear-cuenta";
export const NAME_FIELD = "business";
/** Where "enter" points when the keys live in the browser. */
export const TEST_MODE_ID = "modo-de-prueba";

export interface AccountProps {
  onCreate: (name: string) => void;
  creating: boolean;
  onEnter: (credentialId?: string) => void;
  /** The test passkey being entered with, or true while entering with a device passkey. */
  entering: string | boolean;
  problem: string | null;
  /** The keys kept in this browser instead of device passkeys, when the app runs that way. */
  testPasskeys: Array<{ credentialId: string; name: string }> | null;
  /** Enters an example business, made up for trying the app without bringing anyone along. */
  onTryExample: () => void;
  tryingExample: boolean;
  /** Whether this browser was already handed an example business, to go back to it. */
  keptExample: boolean;
}

/** Takes the pointer to the name field, so that a link to the form saves a click. */
export function focusName() {
  document.getElementById(NAME_FIELD)?.focus({ preventScroll: true });
}

/** The way in: the form that creates the account of a business, and the button for one that already has it. */
export function Account(props: AccountProps) {
  const { onCreate, creating, onEnter, entering, problem, testPasskeys, onTryExample, tryingExample, keptExample } = props;
  const [name, setName] = useState("");
  const busy = creating || entering !== false || tryingExample;

  return (
    <div className="max-w-xl">
      <form
        id={FORM_ID}
        className="flex scroll-mt-24 flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(name.trim());
        }}
      >
        <label htmlFor={NAME_FIELD} className="text-sm font-medium">
          Crea la cuenta de tu negocio
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={NAME_FIELD}
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre del negocio"
            className="field min-w-0 flex-1"
          />
          <Button type="submit" size="lg" busy={creating} disabled={busy}>
            {creating ? "Creando la cuenta…" : "Crear cuenta con passkey"}
          </Button>
        </div>
        <p className="text-sm text-muted">
          Tu passkey es la llave de la cuenta: la guarda tu dispositivo y firmas con tu huella o tu rostro. No hay contraseñas ni frases que
          anotar.
        </p>
      </form>

      <div className="mt-7 flex flex-col items-start gap-3 rounded-2xl border border-hairline bg-card p-5">
        <p className="text-sm text-body">
          <span className="font-medium text-ink">¿Vienes a mirar?</span> Entra a un negocio de ejemplo con proveedores, clientes, historial
          y un círculo listo para firmar. Sin passkey y sin invitar a nadie: los otros negocios responden solos, y todo ocurre de verdad en
          la red de pruebas de Stellar.
        </p>
        <Button variant="outline" busy={tryingExample} disabled={busy} onClick={onTryExample}>
          {tryingExample ? "Abriendo el negocio…" : keptExample ? "Volver a mi negocio de ejemplo" : "Probar con un negocio de ejemplo"}
        </Button>
      </div>

      <div id={testPasskeys ? TEST_MODE_ID : undefined} className="mt-7 flex scroll-mt-24 flex-col gap-3 border-t border-hairline pt-5">
        {testPasskeys ? (
          <>
            <p className="text-sm text-body">
              <span className="font-medium text-ink">Modo de prueba.</span> Las llaves se guardan en este navegador en vez de ser passkeys
              del dispositivo. {testPasskeys.length > 0 ? "Entra como:" : "Todavía no hay ninguna: crea una cuenta arriba."}
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

      <div className="mt-4 empty:hidden">
        <Problem>{problem}</Problem>
      </div>
    </div>
  );
}
