import { EXAMPLE } from "./facts";
import { Section } from "./section";

/** Each benefit with the figure that backs it and the objection it answers. */
const BENEFITS = [
  {
    figure: String(EXAMPLE.moved),
    of: `de cada ${EXAMPLE.cleared} cambian de mano`,
    title: "Liquidez sin financiamiento",
    text: "Lo que te deben paga lo que debes. En el círculo de ejemplo se cancelan 270 en deudas y solo 20 se mueven: nadie pide un crédito para pagar mientras espera cobrar.",
  },
  {
    figure: `${EXAMPLE.clearedWithoutMoney} de ${EXAMPLE.cleared}`,
    of: "se cancelan sin que nadie pague",
    title: "Compensa aunque no tengas plata",
    text: "Si no puedes pagar tu neto, eliges «sin mover dinero»: se cancela lo que las deudas tienen en común y lo demás queda pendiente. Nadie necesita tener saldo en la cuenta.",
  },
  {
    figure: "100 = 80 + 20",
    of: "deja de cobrar = deja de deber + recibe",
    title: "Nadie queda mejor ni peor",
    text: "Lo que dejas de cobrar es exactamente lo que dejas de deber más lo que recibes. Ves tus tres cifras antes de firmar y firmas exactamente eso: nada puede cambiar después.",
  },
  {
    figure: "3 de 3",
    of: "firmas, o no pasa nada",
    title: "Sin cámara de compensación",
    text: "Nadie junta la plata ni la reparte. Cada negocio autoriza solo su parte y todas las firmas viajan juntas en una transacción: o se cancela el círculo completo, o no se cancela nada.",
  },
  {
    figure: "0",
    of: "contraseñas, extensiones o comisiones",
    title: "Sin contraseñas ni comisiones",
    text: "Tu cuenta es una passkey: firmas con la huella o el rostro, como desbloqueas el teléfono. Las comisiones de la red las paga un relayer, así que tu negocio no compra ni instala nada.",
  },
  {
    figure: "+2",
    of: "llaves: una de respaldo y una de contador",
    title: "Tu negocio sigue siendo tuyo",
    text: "Una passkey de respaldo recupera la cuenta si pierdes el teléfono. La llave de contador registra y acepta deudas, pero nunca firma una liquidación. Y te avisamos cuando algo espera tu firma.",
  },
];

/** The features, written as what they do for a business. */
export function Benefits() {
  return (
    <Section
      id="beneficios"
      eyebrow="Lo que cambia"
      title={
        <>
          Menos deuda en los libros, <em>sin pedir un peso prestado</em>.
        </>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(({ figure, of, title, text }) => (
          <li key={title} className="flex flex-col rounded-2xl border border-hairline bg-card p-6 sm:p-7">
            <p className="display text-4xl">{figure}</p>
            <p className="mt-1 text-caption text-muted">{of}</p>
            <h3 className="mt-6 text-title font-medium">{title}</h3>
            <p className="mt-2 text-body-sm text-body">{text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
