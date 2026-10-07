import { EXAMPLE } from "./facts";
import { Section } from "./section";

const QUESTIONS = [
  {
    question: "¿Necesito saber de blockchain?",
    answer:
      "No. Creas la cuenta con el nombre de tu negocio y tu huella o tu rostro. No hay frases semilla, extensiones ni monedas que comprar: las comisiones de la red las paga un relayer. Stellar está debajo para que nadie tenga que confiar en un operador, pero no tienes que verla.",
  },
  {
    question: "¿Qué pasa si falta una firma?",
    answer:
      "Nada. La liquidación solo ocurre cuando llega la última firma; hasta entonces las deudas siguen como estaban. Nadie puede cancelar una deuda tuya sin tu firma, y si el plazo vence, el círculo se puede volver a proponer.",
  },
  {
    question: "¿Quién ve mis deudas?",
    answer:
      "En un círculo ves por nombre solo a tu negocio y a los dos con los que tratas; los demás aparecen como marcas anónimas que solo dicen si ya firmaron. Los nombres de los demás no se muestran; en la red quedan las direcciones, que son públicas.",
  },
  {
    question: "¿Y si no tengo saldo?",
    answer: `Eliges «sin mover dinero»: se cancela solo lo que las deudas tienen en común y lo que sobra queda pendiente. En el ejemplo, ${EXAMPLE.clearedWithoutMoney} de ${EXAMPLE.cleared} sin que nadie pague nada.`,
  },
  {
    question: "¿Qué pasa si pierdo mi teléfono?",
    answer:
      "Puedes registrar una passkey de respaldo en otro dispositivo; con ella entras y sigues firmando. Sin respaldo, la cuenta queda con la passkey que la creó, así que conviene agregarlo al empezar.",
  },
  {
    question: "¿Es dinero real?",
    answer:
      "Hoy no. Nodus corre en la red de pruebas de Stellar y liquida con un USDC de prueba. Lo que ves funcionar es el mecanismo completo; el dinero, todavía no.",
  },
  {
    question: "¿Tiene efecto legal o contable?",
    answer:
      "Por sí sola, la compensación en la red no lo tiene. Cada deuda puede llevar la referencia de su factura y su vencimiento, y de cada liquidación queda un recibo que cualquiera puede verificar en la red, para respaldar la compensación en tus libros.",
  },
  {
    question: "¿Qué pasa con una deuda que no reconozco?",
    answer:
      "La rechazas y no entra en ningún círculo. Las deudas las declaran las partes: hoy Nodus no las cruza con facturas ni con el SII, así que ninguna vale sin la aceptación de quien debe.",
  },
];

/** The objections, answered plainly. */
export function Faq() {
  return (
    <Section
      id="preguntas"
      eyebrow="Preguntas"
      title={
        <>
          Lo que todos <em>preguntan primero</em>.
        </>
      }
    >
      <div className="max-w-3xl border-t border-hairline">
        {QUESTIONS.map(({ question, answer }) => (
          <details key={question} className="group border-b border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-5 [&::-webkit-details-marker]:hidden">
              <h3 className="text-title font-medium">{question}</h3>
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border border-hairline-strong text-lg leading-none text-body transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="max-w-2xl pb-6 text-body">{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
