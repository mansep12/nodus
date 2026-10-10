/*
 * Not a scene of the video: a card that says what gets recorded from the
 * app at this point, so that the player follows the script from start to
 * end and the cut has a marker between the drawings and the demo. It
 * covers the world at once, as the cut it marks.
 */

const SHOTS = [
  ["Entrar", "/ · «Crear cuenta» con la huella. Se ve el prompt de la passkey, de verdad."],
  ["Registrar", "Libros · «Registrar» lo que te deben: Molino Andes, 100."],
  ["Aceptar", "Bandeja del otro negocio · la deuda llega y se acepta con su firma; la cuerda se dibuja."],
  ["El círculo", "Bandeja · aparece el círculo: dejas de deber 100, dejan de deberte 90, pagas 10."],
  ["Firmar", "«Firmar mi parte» · prompt de passkey; la firma viaja al siguiente."],
  ["Última firma", "El nudo se aprieta y se suelta · «Confirmada en la red» · enlace a stellar.expert."],
];

export function Slate() {
  return (
    <div className="absolute inset-0 bg-canvas">
      <div className="absolute inset-x-0 top-20 flex flex-col items-center gap-4 text-center">
        <p className="eyebrow text-muted" style={{ fontSize: 24 }}>
          Aquí va la aplicación, grabada aparte
        </p>
        <h1 className="display text-[64px]">Demo</h1>
      </div>
      <ol className="absolute inset-x-[260px] top-[330px] grid grid-cols-2 gap-x-16 gap-y-8">
        {SHOTS.map(([title, text], index) => (
          <li key={title} className="flex gap-6 border-t border-hairline pt-6">
            <span className="display w-14 shrink-0 text-[40px] leading-none text-muted">{index + 1}</span>
            <div>
              <p className="eyebrow text-muted" style={{ fontSize: 24 }}>
                {title}
              </p>
              <p className="mt-2 text-[26px] leading-snug text-body">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
