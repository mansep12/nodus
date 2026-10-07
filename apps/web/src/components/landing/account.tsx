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
}

/** Takes the pointer to the name field, so that a link to the form saves a click. */
export function focusName() {
  document.getElementById(NAME_FIELD)?.focus({ preventScroll: true });
}

/** The way in: the form that creates the account of a business, and the button for one that already has it. */
export function Account({ onCreate, creating, onEnter, entering, problem, testPasskeys }: AccountProps) {
  const [name, setName] = useState("");
  const busy = creating || entering !== false;

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
