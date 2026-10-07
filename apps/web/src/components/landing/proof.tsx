import { Chip } from "../ui";
import { EXAMPLE } from "./facts";

/** Figures of what the mechanism does, each saying where it comes from so that none reads as a figure of use. */
const FIGURES = [
  {
    figure: String(EXAMPLE.cleared),
    label: `en deudas canceladas moviendo solo ${EXAMPLE.moved}, en el círculo de ejemplo de tres negocios`,
  },
  { figure: "20", label: "negocios liquidados en una sola transacción de prueba, con 20 firmas de passkey" },
  { figure: "0", label: "comisiones para el negocio: las de la red las paga un relayer" },
  { figure: "1", label: "firma por negocio, con su huella o su rostro, y solo sobre su parte" },
];

/** What already works, in numbers, under the hero. */
export function Proof() {
  return (
    <div className="mt-14 border-t border-hairline pt-6 sm:mt-16">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted">
        <Chip>Red de pruebas de Stellar</Chip>
        <span>Cifras del mecanismo, no de uso: Nodus es un prototipo y todavía no liquida dinero real.</span>
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:gap-x-8 lg:grid-cols-4">
        {FIGURES.map(({ figure, label }) => (
          <li key={label}>
            <p className="display text-4xl">{figure}</p>
            <p className="mt-1.5 max-w-[26ch] text-caption text-muted">{label}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
