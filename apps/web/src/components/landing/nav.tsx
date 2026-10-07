"use client";

import { Button, Logo, buttonClass } from "../ui";
import { FORM_ID, TEST_MODE_ID, focusName } from "./account";
import { CONTAINER } from "./section";

interface Props {
  /** Enters with the passkey of the device. */
  onEnter: () => void;
  entering: boolean;
  busy: boolean;
  /** When the keys live in the browser, entering means picking one of them in the hero. */
  testMode: boolean;
}

const ANCHORS = [
  ["#como-funciona", "Cómo funciona"],
  ["#por-que-stellar", "Por qué Stellar"],
  ["#preguntas", "Preguntas"],
];

/** The top of the page: the logo, where the page goes, and the two ways in. */
export function LandingNav({ onEnter, entering, busy, testMode }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline/80 bg-canvas/85 backdrop-blur-md">
      <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
        <a href="#inicio" aria-label="Nodus, inicio de la página" className="rounded-md">
          <Logo className="text-title" />
        </a>

        <nav aria-label="Secciones de la página" className="hidden items-center gap-7 text-body-sm font-medium text-body md:flex">
          {ANCHORS.map(([href, label]) => (
            <a key={href} href={href} className="rounded-sm transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {testMode ? (
            <a href={`#${TEST_MODE_ID}`} className={buttonClass("outline", "sm")}>
              Entrar
            </a>
          ) : (
            <Button variant="outline" size="sm" busy={entering} disabled={busy} onClick={onEnter}>
              Entrar
            </Button>
          )}
          <a href={`#${FORM_ID}`} onClick={focusName} className={buttonClass("primary", "sm")}>
            Crear cuenta
          </a>
        </div>
      </div>
    </header>
  );
}
