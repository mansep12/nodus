import { Eyebrow } from "../ui";
import { AcceptFigure, RegisterFigure, SettleFigure, SignFigure } from "./figures";
import { Section } from "./section";

const STEPS = [
  {
    title: "Registra",
    text: "Anota lo que te deben: a quién y cuánto. Si quieres, agrega la referencia de la factura y la fecha de vencimiento.",
    Figure: RegisterFigure,
  },
  {
    title: "Acepta",
    text: "Quien te debe lo revisa y lo acepta con su passkey. Una deuda que no reconoce, la rechaza: sin aceptación no existe.",
    Figure: AcceptFigure,
  },
  {
    title: "Firma",
    text: "Cuando tus deudas cierran un círculo, Nodus te muestra solo tu efecto: cuánto dejas de deber, cuánto dejan de deberte y cuánto pagas. Firmas solo tu parte.",
    Figure: SignFigure,
  },
  {
    title: "Liquida",
    text: "Con la última firma, una sola transacción cancela todas las deudas del círculo y mueve solo los saldos netos. Si falta una firma, no pasa nada.",
    Figure: SettleFigure,
  },
];

/** The four steps, each tied back to what the hero promised. */
export function HowItWorks() {
  return (
    <Section
      id="como-funciona"
      eyebrow="Cómo funciona"
      title={
        <>
          Cuatro pasos y <em>una sola transacción</em>.
        </>
      }
      lede="Nodus no cobra ni paga por ti: junta las firmas y deja que la red cancele todo a la vez."
    >
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(({ title, text, Figure }, index) => (
          <li key={title} className="flex flex-col rounded-2xl border border-hairline bg-card p-6">
            <div className="flex justify-center rounded-xl bg-canvas-soft px-3 py-2">
              <Figure />
            </div>
            <Eyebrow className="mt-6">Paso {index + 1}</Eyebrow>
            <h3 className="display mt-2 text-2xl">{title}</h3>
            <p className="mt-2 text-body-sm text-body">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
