import { Card, Chip } from "../ui";
import { TRANSACTIONS, type Transaction } from "./facts";
import { Section } from "./section";

const REASONS = [
  {
    title: "Atómica",
    text: "La cancelación de todas las deudas y el pago de los netos van en una misma transacción. Se ejecuta completa o se rechaza completa: no existe un círculo a medias.",
  },
  {
    title: "Cada uno autoriza lo suyo",
    text: "El contrato exige la autorización de cada negocio del círculo. Un servidor reúne las firmas y las reenvía, pero no puede alterarlas ni firmar por nadie: tu navegador comprueba que firmas exactamente el círculo que ves.",
  },
  {
    title: "Verificable por cualquiera",
    text: "Los eventos del contrato son el recibo. Cualquiera puede abrir la transacción en el explorador de la red y comprobar qué deudas se cancelaron y cuánto dinero se movió.",
  },
];

/** Why it runs on Stellar, with the two settlements anyone can open. */
export function Trust() {
  return (
    <Section
      id="por-que-stellar"
      eyebrow="Por qué Stellar"
      title={
        <>
          O pasa todo, <em>o no pasa nada</em>.
        </>
      }
      lede="Aquí sí hablamos de la red, porque es lo que permite que nadie tenga que confiar en un operador."
      band
    >
      <dl className="grid gap-x-10 gap-y-8 border-t border-hairline pt-8 md:grid-cols-3">
        {REASONS.map(({ title, text }) => (
          <div key={title}>
            <dt className="text-title font-medium">{title}</dt>
            <dd className="mt-2 text-body-sm text-body">{text}</dd>
          </div>
        ))}
      </dl>

      <h3 className="display mt-16 text-2xl sm:text-3xl">Dos liquidaciones que puedes abrir ahora.</h3>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Receipt transaction={TRANSACTIONS.twenty} />
        <Receipt transaction={TRANSACTIONS.three} />
      </div>
      <p className="mt-6 max-w-3xl text-caption text-muted">
        Las cuentas son smart accounts de OpenZeppelin controladas por una passkey y las comisiones las patrocina OpenZeppelin Relayer. El
        contrato, el buscador de círculos y esta aplicación son código abierto.
      </p>
    </Section>
  );
}

/** A settlement on the test network, with the link that proves it. */
function Receipt({ transaction }: { transaction: Transaction }) {
  return (
    <Card padding="sm" className="flex flex-col gap-4 sm:p-7">
      <div>
        <Chip tone="free">Liquidado en la red de pruebas</Chip>
      </div>
      <div className="flex-1">
        <h4 className="display text-2xl">{transaction.title}</h4>
        <p className="mt-2 text-body-sm text-body">{transaction.text}</p>
        {transaction.note && <p className="mt-2 text-body-sm text-body">{transaction.note}</p>}
      </div>
      <a
        href={transaction.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 self-start rounded-sm text-sm font-medium underline-offset-4 hover:underline"
      >
        Ver la transacción en la red
        <span className="font-mono text-caption font-normal text-muted">
          {transaction.hash.slice(0, 6)}…{transaction.hash.slice(-6)}
        </span>
      </a>
    </Card>
  );
}
