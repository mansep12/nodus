import { Amount, Avatar, Eyebrow } from "../ui";
import { EXAMPLE } from "./facts";
import { Section } from "./section";

const UNIT = "0000000";
const DEBTS = [
  ["Panadería Sur", "Molino Andes", 100],
  ["Molino Andes", "Fletes Ruta 5", 80],
  ["Fletes Ruta 5", "Panadería Sur", 90],
] as const;

/** The problem: everyone waits to be paid in order to pay, while the money sits tied up. */
export function Tangle() {
  return (
    <Section
      id="el-nudo"
      eyebrow="El nudo"
      title={
        <>
          Todos esperan cobrar <em>para poder pagar</em>.
        </>
      }
      lede="La plata existe, pero está amarrada: cada negocio la tiene comprometida en lo que le deben."
      band
    >
      <div className="grid items-start gap-x-14 gap-y-10 lg:grid-cols-2">
        <div className="flex flex-col gap-5 text-lg text-body">
          <p>
            La panadería le debe al molino, el molino a los fletes y los fletes a la panadería. Nadie paga porque nadie ha cobrado, y
            mientras tanto alguien pide un crédito para cubrir una deuda que, vista en círculo, casi se paga sola.
          </p>
          <p>
            Son {EXAMPLE.cleared} en deudas, pero solo {EXAMPLE.moved} tienen que cambiar de mano. El resto se cancela entre sí. Lo que
            falta es que los tres lo vean a la vez y lo firmen.
          </p>
        </div>

        <figure className="rounded-3xl border border-hairline bg-card p-6 sm:p-8">
          <ul className="divide-y divide-hairline">
            {DEBTS.map(([from, to, amount]) => (
              <li key={from} className="flex items-center gap-3 py-3.5 text-body-sm">
                <Avatar name={from} size="sm" />
                <span className="min-w-0 flex-1 text-body">
                  <span className="font-medium text-ink">{from}</span> le debe a <span className="font-medium text-ink">{to}</span>
                </span>
                <span className="text-title font-medium">
                  <Amount value={`${amount}${UNIT}`} />
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-5">
            <div>
              <dt>
                <Eyebrow>Deuda en el círculo</Eyebrow>
              </dt>
              <dd className="display mt-2 text-4xl">{EXAMPLE.cleared}</dd>
            </div>
            <div>
              <dt>
                <Eyebrow>Lo que de verdad hace falta</Eyebrow>
              </dt>
              <dd className="display mt-2 text-4xl">{EXAMPLE.moved}</dd>
            </div>
          </dl>
          <figcaption className="mt-4 text-caption text-muted">
            Los otros {EXAMPLE.cleared - EXAMPLE.moved} se cancelan entre sí: nadie tiene que tenerlos en la cuenta.
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
