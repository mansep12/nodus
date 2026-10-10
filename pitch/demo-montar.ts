/**
 * Corta la demo grabada (`pitch/grabar.ts`) a la voz (`pitch/voz/demo.mp3`):
 * cada cosa que pasa en pantalla cae en el segundo en que la voz la dice.
 *
 *   bun pitch/demo-montar.ts                              # de pitch/out/demo/toma a pitch/out/demo-sin-voz.mp4
 *   bun pitch/demo-montar.ts --toma pitch/out/demo/toma-2 --salida pitch/out/demo-sin-voz.mp4
 *   bun pitch/mezclar.ts --video pitch/out/demo-sin-voz.mp4 --voz pitch/out/demo-voz.wav --salida pitch/out/demo.mp4
 *
 * La grabación deja quieto el puntero entre una acción y la siguiente, y marca la hora de cada una
 * (`marcas.json`). Aquí cada tramo empieza en una marca y se pone en su segundo de la voz: si el tramo
 * siguiente llega antes, este se corta (en una pausa, así que no se nota); si llega después, su último
 * cuadro se queda. Nada va acelerado: lo que se salta son las esperas de la red, con un corte.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ffmpeg, ffmpegReport } from "./ffmpeg.ts";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    toma: { type: "string", default: "pitch/out/demo/toma" },
    salida: { type: "string", default: "pitch/out/demo-sin-voz.mp4" },
    hasta: { type: "string", default: "43.0" },
    fin: { type: "string" },
  },
});
const TAKE = resolve(args.toma);
const FPS = 60;
/** Lo que dura la demo: la voz (42,4 s) y un respiro. */
const END = Number(args.hasta);

type Camera = "panaderia" | "transportista";
type Moment = [mark: string, offset: number];
interface Beat {
  camera: Camera;
  /** Dónde empieza el tramo en la grabación. */
  from: Moment;
  /** El momento que tiene que caer en `at`; si falta, el comienzo del tramo. */
  anchor?: Moment;
  /** El segundo de la voz. */
  at: number;
  /** Hasta dónde sirve la grabación; después se queda el último cuadro. */
  until?: Moment;
  says: string;
}

/** Hasta dónde sirve el final de la toma. `--fin desanudado:3.4` para una toma en que el puntero llegó tarde a «Pagaste». */
const LAST: Moment = args.fin ? [args.fin.split(":")[0]!, Number(args.fin.split(":")[1])] : ["pagaste", 0.9];

/**
 * La voz, con el segundo de cada frase (de `pitch/out/demo.palabras.json`), y lo que se ve con ella.
 * Las marcas son las de `grabar.ts`.
 */
const BEATS: Beat[] = [
  // 0,3 «Ahora bien, pasando a la demo.» 2,3 «Esta es la aplicación.» 3,9 «Yo soy la panadería y entro (5,4) con mi passkey.»
  // 7,0 «Sin necesidad de poner una contraseña…» La portada, el clic en «Entrar con mi passkey», la red que se dibuja y un cliente.
  {
    camera: "panaderia",
    from: ["entrar", -5.5],
    anchor: ["entrar", 0],
    at: 5.5,
    until: ["registrar", 0],
    says: "la portada, entrar, la red",
  },
  // 9,8 «…o sin necesidad de tener que anotar nada.» 12,2 «El transportista me debe 90, así que lo puedo anotar aquí.» (hasta 15,2)
  {
    camera: "panaderia",
    from: ["registrar", 0],
    anchor: ["registrar-clic", 0],
    at: 15.35,
    until: ["registrar-clic", 0.4],
    says: "registrar una deuda: Flet, 90",
  },
  { camera: "panaderia", from: ["registrada", -0.2], at: 15.75, until: ["registrada", 3.2], says: "la deuda, punteada" },
  // 16,1 «Él ahora luego lo acepta (17,0) desde su cuenta con su propia firma (18,7).»
  {
    camera: "transportista",
    from: ["aceptar-clic", -1.5],
    anchor: ["aceptar-clic", 0],
    at: 17.75,
    until: ["aceptar-clic", 0.4],
    says: "la bandeja del transportista",
  },
  // Apenas acepta, su bandeja cambia la deuda por el círculo que se cerró, con la parte de él.
  {
    camera: "transportista",
    from: ["aceptada", -0.45],
    at: 18.2,
    until: ["aceptada", 2.8],
    says: "aceptada: el círculo, visto por el transportista",
  },
  // 20,3 «Con eso se cerró un círculo (21,1) y Nodus me muestra solamente mi parte (23,3).»
  { camera: "panaderia", from: ["ir-a-bandeja", -1.1], at: 20.15, until: ["cifra-1", -0.7], says: "el aviso, ir a la bandeja, la tarjeta" },
  // 24,4 «Dejo de deber 100 (25,0), 26,1 dejan de deberme 90 (26,8) 27,5 y pago 10 (27,8).»
  { camera: "panaderia", from: ["cifra-1", -0.7], anchor: ["cifra-1", 0], at: 24.75, until: ["cifra-1", 1.4], says: "dejas de deber 100" },
  { camera: "panaderia", from: ["cifra-2", -0.7], anchor: ["cifra-2", 0], at: 26.4, until: ["cifra-2", 1.4], says: "dejan de deberte 90" },
  { camera: "panaderia", from: ["cifra-3", -0.7], anchor: ["cifra-3", 0], at: 27.7, until: ["cifra-3", 1.4], says: "pagas 10" },
  // 28,8 «Yo ahora firmo (29,2) lo mío y espero que los otros dos lo hagan (31,1).»
  {
    camera: "panaderia",
    from: ["firmar-clic", -1.15],
    anchor: ["firmar-clic", 0],
    at: 29.55,
    until: ["firmar-clic", 0.4],
    says: "firmar con passkey",
  },
  // 31,8 «Si falta una firma no va a pasar nada simplemente.» (hasta 34,2)
  { camera: "panaderia", from: ["1-de-3", -0.25], at: 30.1, until: ["2-de-3", -0.4], says: "firmando, 1 de 3; si falta una firma…" },
  // 35,0 «Y cuando firma el último (35,7), está listo (36,5).» El nudo se aprieta y se suelta desde 1,6 s antes de «Desanudado».
  { camera: "panaderia", from: ["2-de-3", -0.3], at: 34.2, until: ["2-de-3", 1.4], says: "2 de 3" },
  { camera: "panaderia", from: ["3-de-3", -0.15], at: 34.85, until: ["3-de-3", 1.2], says: "3 de 3, liquidando" },
  // 37,3 «Una sola transacción cancela las tres deudas 39,9 y pago (40,0) solamente la diferencia.» (hasta 41,4)
  // De corrido hasta que el puntero llega a «Pagaste 10»; ahí se queda, antes de que la página se reacomode.
  {
    camera: "panaderia",
    from: ["desanudado", -1.9],
    anchor: ["desanudado", 0],
    at: 37.25,
    until: LAST,
    says: "el nudo, desanudado, el comprobante, pagaste 10",
  },
];

interface Take {
  takes: Record<Camera, { start: number; seconds: number }>;
  marks: Array<{ name: string; camera: Camera; t: number }>;
}
const take = JSON.parse(readFileSync(join(TAKE, "marcas.json"), "utf8")) as Take;

/** El segundo del video de `camera` en que pasa `moment`. */
function when(camera: Camera, [name, offset]: Moment): number {
  const found = take.marks.find((mark) => mark.name === name && mark.camera === camera);
  if (!found) throw new Error(`La toma no tiene la marca "${name}" de ${camera}.`);
  return found.t - take.takes[camera].start + offset;
}

const frames = (seconds: number) => Math.round(seconds * FPS);
const starts = BEATS.map((beat) => frames(beat.at - (when(beat.camera, beat.anchor ?? beat.from) - when(beat.camera, beat.from))));

const inputs: string[] = [];
const graph: string[] = [];
console.log("  en el video   dura   de la grabación        se queda  ");
for (const [index, beat] of BEATS.entries()) {
  const begins = index === 0 ? 0 : starts[index]!;
  const ends = index === BEATS.length - 1 ? frames(END) : starts[index + 1]!;
  const length = (ends - begins) / FPS;
  if (length <= 0) throw new Error(`"${beat.says}" no tiene lugar: el tramo siguiente empieza antes.`);
  // El primer tramo empieza donde haga falta para llegar al segundo cero.
  const from = when(beat.camera, beat.from) - (index === 0 ? starts[0]! / FPS : 0);
  if (from < 0) throw new Error(`"${beat.says}" empieza antes que la grabación (${from.toFixed(2)} s).`);
  const available = (beat.until ? when(beat.camera, beat.until) : take.takes[beat.camera].seconds) - from;
  const used = Math.min(length, available);
  const frozen = length - used;
  console.log(
    `  ${(begins / FPS).toFixed(2).padStart(6)} s  ${length.toFixed(2).padStart(5)} s  ${beat.camera.padEnd(13)} ${from.toFixed(2).padStart(6)} s  ` +
      `${frozen > 0.01 ? `${frozen.toFixed(2)} s` : "      "}  ${beat.says}${available > length + 0.3 ? `  (se cortan ${(available - length).toFixed(1)} s)` : ""}`,
  );
  inputs.push("-ss", from.toFixed(4), "-t", (used + 0.1).toFixed(4), "-i", join(TAKE, `${beat.camera}.mp4`));
  graph.push(
    // Sin `setpts` antes de `tpad`: con él, `tpad` no agrega ningún cuadro.
    `[${index}:v]fps=${FPS},tpad=stop_mode=clone:stop_duration=${(frozen + 1).toFixed(3)},` +
      `trim=end_frame=${ends - begins},setpts=PTS-STARTPTS[v${index}]`,
  );
}
graph.push(`${BEATS.map((_, index) => `[v${index}]`).join("")}concat=n=${BEATS.length}:v=1:a=0,format=yuv420p[video]`);

await ffmpeg([
  ...inputs,
  "-filter_complex", graph.join(";"),
  "-map", "[video]", "-r", String(FPS),
  "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-movflags", "+faststart",
  resolve(args.salida),
]); // prettier-ignore
// Que dure lo que tiene que durar: cada tramo aporta sus cuadros justos.
const report = await ffmpegReport(["-i", resolve(args.salida), "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
const written = Number(
  report
    .match(/frame=\s*(\d+)/g)
    ?.at(-1)
    ?.replace(/\D/g, ""),
);
if (written !== frames(END)) throw new Error(`El video quedó de ${written} cuadros y tenían que ser ${frames(END)}.`);
console.log(`Listo: ${args.salida} (${END} s)`);
