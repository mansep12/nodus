"use client";

import { INK } from "@/lib/tones";
import { Bloom, Eyebrow, buttonClass } from "../ui";
import { FORM_ID, focusName } from "./account";
import { HACKATHON } from "./facts";
import { CONTAINER } from "./section";

/** The hero's promise, kept, and a word about who made this and what is still missing. */
export function Closing() {
  return (
    <section id="empezar" aria-labelledby="empezar-titulo" className={`${CONTAINER} scroll-mt-16 py-14 sm:py-24`}>
      <div className="relative isolate overflow-hidden rounded-3xl border border-hairline bg-canvas-soft px-6 py-16 text-center sm:px-12 sm:py-24">
        <Bloom color={INK.credit.bloom} className="left-[28%] top-1/2 -z-10 size-[70%] -translate-x-1/2 -translate-y-1/2 opacity-70" />
        <Bloom color={INK.free.bloom} className="left-[72%] top-[40%] -z-10 size-[60%] -translate-x-1/2 -translate-y-1/2 opacity-60" />
        <Bloom color={INK.debt.bloom} className="left-[55%] top-[95%] -z-10 size-[50%] -translate-x-1/2 -translate-y-1/2 opacity-50" />
        <Eyebrow>Empezar</Eyebrow>
        <h2 id="empezar-titulo" className="display mx-auto mt-3 max-w-2xl text-4xl text-balance sm:text-5xl">
          Lo que te deben <em>ya puede pagar</em> lo que debes.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-body">
          Crea la cuenta con el nombre de tu negocio y registra la primera deuda. Cuando quien te debe la acepte y las deudas cierren un
          círculo, Nodus te avisa para que firmes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={`#${FORM_ID}`} onClick={focusName} className={buttonClass("primary", "lg")}>
            Crear la cuenta de mi negocio
          </a>
          <a href="#como-funciona" className={buttonClass("outline", "lg")}>
            Ver cómo funciona
          </a>
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-body-sm text-muted">
        Nodus se hizo en Chile para el hackathon «{HACKATHON}» de Stellar. Hoy corre en la red de pruebas con un USDC de prueba: el
        mecanismo es real, el dinero no. Las deudas las declaran las partes y la identidad de los negocios no está verificada; lo que sigue
        es conectar facturas e identidad.
      </p>
    </section>
  );
}
