import type { ReactNode } from "react";
import { Eyebrow } from "../ui";
import { Account, type AccountProps } from "./account";
import { Proof } from "./proof";
import { CONTAINER } from "./section";

interface Props extends AccountProps {
  /** The product, playing, beside the copy. */
  demo: ReactNode;
}

/** What Nodus does, in one line, with the way in and the product playing beside it. */
export function Hero({ demo, ...account }: Props) {
  return (
    <section id="inicio" aria-labelledby="inicio-titulo" className={`${CONTAINER} scroll-mt-16 pb-14 pt-10 sm:pb-24 sm:pt-14`}>
      <div className="grid items-center gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <div>
          <Eyebrow>Compensación de deudas entre pymes</Eyebrow>
          <h1 id="inicio-titulo" className="display mt-5 text-[40px] text-balance sm:text-5xl lg:text-[56px]">
            Cancela lo que debes con lo que te deben, <em>sin esperar a que te paguen</em>.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-body sm:text-lg">
            Cuando A le debe a B, B le debe a C y C le debe a A, todos esperan cobrar para poder pagar. Nodus encuentra ese círculo, cada
            negocio firma solo su parte con su passkey y una sola transacción cancela todas las deudas moviendo apenas el saldo neto.
          </p>
          <div className="mt-9">
            <Account {...account} />
          </div>
        </div>

        {demo}
      </div>

      <Proof />
    </section>
  );
}
