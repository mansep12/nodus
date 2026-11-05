/**
 * Los subtítulos: en inglés, quemados sobre el video entero, y además un SRT
 * en inglés y otro en español para subir junto al video.
 *
 *   bun pitch/subtitulos.ts                                   # pitch/out/nodus-final-en.mp4
 *   bun pitch/subtitulos.ts --video pitch/out/otro.mp4 --salida pitch/out/otro-en.mp4
 *   bun pitch/subtitulos.ts --solo-srt                        # solo pitch/out/subtitulos/{en,es}.srt
 *
 * Cada línea de `CUES` lleva los segundos de SU voz (A.mp3, demo.mp3, B.mp3),
 * tomados de `pitch/out/*.palabras.json`: la primera palabra y el final de la
 * última. El script los lleva al video entero con la cuenta de `final.ts` (A y
 * B a 1,1×, la demo a su velocidad, un fundido entre pieza y pieza).
 *
 * El inglés es una traducción condensada de lo que se dijo, no del guion: dos
 * líneas de hasta 42 caracteres y no más de 20 caracteres por segundo. El
 * ffmpeg de Flatpak no trae `subtitles` ni `drawtext`, así que cada subtítulo
 * se dibuja en Chromium con la tipografía de la app y se superpone como imagen.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { ffmpeg, ffmpegReport } from "./ffmpeg.ts";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    video: { type: "string", default: "pitch/out/nodus-final.mp4" },
    salida: { type: "string", default: "pitch/out/nodus-final-en.mp4" },
    demo: { type: "string", default: "pitch/out/demo-sin-voz.mp4" },
    "solo-srt": { type: "boolean", default: false },
    /** `veryfast` para una prueba; el definitivo va con `slow`. */
    preset: { type: "string", default: "slow" },
  },
});

type Part = "A" | "demo" | "B";
/** Parte, primera palabra, final de la última, inglés (con `\n` entre líneas), español. */
type Cue = [Part, number, number, string, string];
type Spot = "bottom" | "top" | "top-right";

const CUES: Cue[] = [
  [
    "A",
    0.42,
    3.72,
    "In Chile today, a business can close\nwhile it is still owed money.",
    "Hoy en Chile un negocio puede cerrar\naunque todavía tenga dinero por cobrar.",
  ],
  ["A", 4.44, 7.28, "The law sets a 30-day deadline\nto pay invoices,", "La ley establece un plazo de 30 días\npara pagar las facturas,"],
  ["A", 7.82, 9.14, "but the real average is 44.", "pero el promedio real llega a 44."],
  [
    "A",
    10.36,
    13.34,
    "Between small businesses it's worse:\nthe number rises to 53.",
    "Y entre pymes es aún peor:\neste número sube a 53.",
  ],
  ["A", 14.48, 16.28, "Often the delay comes in a chain:", "Muchas veces el atraso viene en cadena,"],
  ["A", 16.92, 19.94, "whoever owes you is also\nwaiting to be paid.", "ya que quien te debe también está\nesperando que le paguen a él."],
  ["A", 20.64, 22.32, "Here's a simple example.", "Ahora voy a dar un ejemplo sencillo,"],
  ["A", 23.26, 25.38, "A bakery owes the mill 100.", "en donde una panadería\nle debe 100 al molino."],
  ["A", 26.0, 27.74, "The mill owes the carrier 80,", "El molino le debe 80 al transportista,"],
  ["A", 28.52, 30.88, "and the carrier owes the bakery 90.", "el transportista le debe 90 a la panadería."],
  ["A", 31.62, 33.08, "All three are owed money,", "Los tres tienen dinero por cobrar,"],
  ["A", 33.8, 36.36, "but none has enough cash to pay.", "pero ninguno tiene suficiente dinero\npara poder pagar."],
  [
    "A",
    38.1,
    41.52,
    "But look at the three debts together:\nthey form a circle.",
    "Pero si miramos las tres deudas juntas,\nvemos que forman un círculo.",
  ],
  ["A", 42.24, 43.22, "That's why we built Nodus.", "Para eso hicimos Nodus:"],
  [
    "A",
    43.82,
    47.0,
    "It nets those debts so only\nthe difference has to be paid.",
    "permite compensar esas deudas para que\nsolo haya que pagar la diferencia.",
  ],
  ["A", 47.68, 50.26, "In this example there's 270 in debt,", "En este ejemplo hay 270 en deuda,"],
  ["A", 50.68, 52.02, "but moving just 20 is enough.", "pero basta con mover solo 20."],
  [
    "A",
    52.72,
    57.02,
    "The bakery and the carrier pay 10 each,\nand the mill receives 20.",
    "La panadería y el transportista pagan\n10 cada uno y el molino recibe 20.",
  ],
  ["A", 57.78, 59.38, "All three debts are settled.", "Así las tres deudas quedan saldadas."],
  ["A", 61.22, 64.3, "A variant of the same example:", "Sobre este mismo ejemplo\nse puede tener una variante"],
  ["A", 64.36, 67.24, "nobody has cash,\nor they'd rather not use it.", "donde nadie tiene caja\no directamente no la quieren usar."],
  ["A", 68.24, 72.2, "Then 80 is taken off each debt", "Y de este modo se descuenta 80\na cada deudor"],
  ["A", 72.26, 74.54, "without moving a single peso.", "sin necesidad de mover ni un solo peso."],
  [
    "A",
    74.9,
    78.91,
    "The bakery still owes the mill 20;\nthe carrier owes the bakery 10.",
    "La panadería queda debiendo 20 al molino;\nel transportista, 10 a la panadería.",
  ],
  ["A", 79.34, 83.42, "From 270 in debts, only 30 remains.", "Pero ya pasa de 270 en deudas\na quedar solamente 30."],
  [
    "A",
    85.8,
    90.0,
    "This happens everywhere: one business\nowes others, others owe it,",
    "Y esto pasa con muchos negocios: uno\nle debe a otros, otros le deben a él,",
  ],
  [
    "A",
    90.04,
    92.66,
    "and those have open accounts\nwith yet another business.",
    "y estos a su vez también tienen\ncuentas pendientes con otro negocio.",
  ],
  [
    "A",
    93.32,
    96.7,
    "A huge web forms, where each one\nsees only their own part.",
    "Y así se va formando una red enorme,\ndonde cada uno solo puede ver lo suyo.",
  ],
  ["A", 97.62, 99.46, "Nobody sees how everyone is connected.", "Pero nadie ve cómo están todos conectados."],
  [
    "A",
    100.04,
    103.7,
    "Nodus does, and so it can find\nthose circles inside the network.",
    "Nodus sí, y gracias a eso puede encontrar\nesos círculos dentro de la red.",
  ],

  ["demo", 0.28, 1.7, "Now, on to the demo.", "Ahora bien, pasando a la demo."],
  ["demo", 2.28, 3.14, "This is the app.", "Esta es la aplicación."],
  ["demo", 3.88, 6.3, "I'm the bakery, and I sign in\nwith my passkey.", "Yo soy la panadería\ny entro con mi passkey,"],
  [
    "demo",
    7.04,
    11.64,
    "No password to type,\nnothing to write down.",
    "sin necesidad de poner una contraseña\nni de tener que anotar nada.",
  ],
  ["demo", 12.24, 14.94, "The carrier owes me 90,\nso I record it here.", "El transportista me debe 90,\nasí que lo puedo anotar aquí."],
  [
    "demo",
    16.08,
    19.08,
    "He then accepts it from his account,\nwith his own signature.",
    "Él luego lo acepta desde su cuenta,\ncon su propia firma.",
  ],
  [
    "demo",
    20.3,
    23.48,
    "That closed a circle, and Nodus\nshows me only my part.",
    "Con eso se cerró un círculo y Nodus\nme muestra solamente mi parte.",
  ],
  ["demo", 24.38, 28.06, "I stop owing 100, I'm no longer\nowed 90, and I pay 10.", "Dejo de deber 100,\ndejan de deberme 90 y pago 10."],
  ["demo", 28.84, 31.26, "I sign my part and wait\nfor the other two.", "Yo ahora firmo lo mío y espero\nque los otros dos lo hagan."],
  ["demo", 31.82, 33.56, "If one signature is missing,\nnothing happens.", "Si falta una firma,\nsimplemente no va a pasar nada."],
  ["demo", 34.96, 36.78, "When the last one signs, it's done.", "Y cuando firma el último, está listo."],
  [
    "demo",
    37.28,
    41.02,
    "One transaction cancels all three debts,\nand I pay only the difference.",
    "Una sola transacción cancela las tres\ndeudas y pago solamente la diferencia.",
  ],

  ["B", 0.0, 1.74, "So, how much can this handle?", "Bueno, ¿y esto ahora cuánto aguanta?"],
  [
    "B",
    2.6,
    5.78,
    "I've tested it with 20 businesses:\n20 signatures, one transaction.",
    "Esto ya lo probé con 20 negocios:\n20 firmas y una sola transacción.",
  ],
  [
    "B",
    6.9,
    9.56,
    "It used just a third of the\ncompute the network allows.",
    "Y ocupó solo un tercio del cómputo\nde lo que la red permite.",
  ],
  [
    "B",
    10.56,
    14.16,
    "Netting debt is nothing new,\nbut there's always a middleman.",
    "Compensar deuda no es nada nuevo,\npero siempre hay alguien entremedio.",
  ],
  [
    "B",
    14.96,
    18.56,
    "For example, a factoring firm that buys\nyour invoice at X% a month.",
    "Por dar un ejemplo, un factoring que te\ncompra la factura a un x por ciento mensual.",
  ],
  ["B", 19.3, 21.58, "With Stellar, there's no one in between.", "La diferencia con Stellar es que\nno hay nadie entremedio."],
  [
    "B",
    21.96,
    25.9,
    "Each business signs its part from a phone,\nand the network runs it all at once.",
    "Cada negocio firma su parte desde el\nteléfono y la red lo ejecuta todo junto.",
  ],
  ["B", 26.72, 29.36, "Nobody holds your money,\nand the receipt is public.", "Nadie tiene tu plata y el recibo\nes público para todos."],
  ["B", 30.36, 33.0, "This is Nodus: it unties\nthe debts between businesses.", "Esto es Nodus: desanuda\nlas deudas entre los negocios."],
];

/* Los tiempos, con la cuenta de `final.ts`. */

const SPEED = 1.1;
const FADE = 0.4;
/** Cuánto se queda un subtítulo después de la última palabra, si el siguiente no lo apura. */
const LINGER = 0.6;
/** El hueco mínimo entre dos subtítulos: se nota el cambio aunque el texto se parezca. */
const GAP = 0.08;
const MAX_LINE = 42;
const MAX_RATE = 20;

async function seconds(path: string): Promise<number> {
  const report = await ffmpegReport(["-i", path, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
  const [, h, m, s] = [...report.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1)!;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

for (const path of ["pitch/out/pitch-A.mp4", args.demo]) if (!existsSync(resolve(path))) throw new Error(`Falta ${path}`);
const startDemo = (await seconds("pitch/out/pitch-A.mp4")) / SPEED - FADE;
const startB = startDemo + (await seconds(args.demo)) - FADE;
const place: Record<Part, (t: number) => number> = {
  A: (t) => t / SPEED,
  demo: (t) => startDemo + t,
  B: (t) => startB + t / SPEED,
};

interface Subtitle {
  start: number;
  end: number;
  en: string;
  es: string;
  spot: Spot;
}
/**
 * Dónde va cada uno, para tapar lo menos posible: abajo al centro, salvo
 * - en la demo, donde la app llega hasta abajo (ahí está «Firmar con passkey»): arriba, sobre la barra de navegación, y
 *   desde «dejo de deber 100» (24,4 s) arriba a la derecha, porque la página ya bajó y al centro está el título;
 * - «solo quedan 30», que abajo taparía «240 compensados · 0 dinero movido».
 */
function spot(part: Part, from: number): Spot {
  if (part === "demo") return from < 24 ? "top" : "top-right";
  return part === "A" && from === 79.34 ? "top" : "bottom";
}
const subtitles: Subtitle[] = CUES.map(([part, from, to, en, es]) => ({
  start: place[part](from),
  end: place[part](to) + LINGER,
  en,
  es,
  spot: spot(part, from),
}));
subtitles.forEach((subtitle, index) => {
  const next = subtitles[index + 1];
  if (next) subtitle.end = Math.min(subtitle.end, next.start - GAP);
  if (subtitle.end <= subtitle.start) throw new Error(`El subtítulo ${index + 1} termina antes de empezar: «${subtitle.en}»`);
  const lines = subtitle.en.split("\n");
  const rate = subtitle.en.replace("\n", " ").length / (subtitle.end - subtitle.start);
  if (lines.length > 2 || lines.some((line) => line.length > MAX_LINE))
    console.warn(`Largo (${index + 1}): «${subtitle.en.replace("\n", " / ")}»`);
  if (rate > MAX_RATE) console.warn(`Rápido (${index + 1}, ${rate.toFixed(1)} car/s): «${subtitle.en.replace("\n", " / ")}»`);
});

/* Los SRT. */

const FOLDER = resolve("pitch/out/subtitulos");
rmSync(FOLDER, { recursive: true, force: true });
mkdirSync(FOLDER, { recursive: true });

function stamp(t: number): string {
  const ms = Math.round(t * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
for (const language of ["en", "es"] as const) {
  const srt = subtitles
    .map((subtitle, index) => `${index + 1}\n${stamp(subtitle.start)} --> ${stamp(subtitle.end)}\n${subtitle[language]}\n`)
    .join("\n");
  writeFileSync(join(FOLDER, `${language}.srt`), srt);
}
console.log(`${subtitles.length} subtítulos: pitch/out/subtitulos/en.srt y es.srt`);
if (args["solo-srt"]) process.exit(0);

/* Las imágenes: un cuadro transparente por subtítulo, con la tipografía de la app. */

const FRAME = { width: 1920, height: 1080 };
const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500&display=block">
<style>
  html, body { margin: 0; background: transparent; }
  body { width: ${FRAME.width}px; height: ${FRAME.height}px; display: flex; align-items: flex-end; justify-content: center; }
  body.top, body.top-right { align-items: flex-start; }
  body.top-right { justify-content: flex-end; padding-right: 120px; box-sizing: border-box; }
  /* Una tarjeta de la app (DESIGN.md): blanca, con filete y sombra suave, y la tinta de siempre en Inter. Pegada al borde, para tapar lo menos posible. */
  p {
    margin: 14px 0 18px; padding: 9px 26px 11px; border-radius: 16px; background: rgb(255 255 255 / 0.94);
    border: 1px solid #d6d3d1; box-shadow: 0 8px 24px rgb(12 10 9 / 0.1), 0 2px 6px rgb(12 10 9 / 0.05);
    color: #0c0a09; font: 500 40px/1.25 Inter, system-ui, sans-serif; letter-spacing: -0.01em;
    text-align: center; white-space: pre; font-feature-settings: "tnum";
  }
</style><p></p>`;

function chromiumPath(): string {
  if (process.env.PITCH_CHROMIUM) return process.env.PITCH_CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright");
  const shells = readdirSync(cache)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const shell of shells) {
    const path = join(cache, shell, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(path)) return path;
  }
  throw new Error("No encuentro chrome-headless-shell: bunx playwright-core install chromium-headless-shell, o PITCH_CHROMIUM=/ruta.");
}

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
const page = await browser.newPage({ viewport: FRAME, deviceScaleFactor: 1 });
await page.setContent(PAGE, { waitUntil: "networkidle" });
const inter = await page.evaluate(async () => {
  await document.fonts.load("500 44px Inter");
  return document.fonts.check("500 44px Inter");
});
if (!inter) console.warn("Inter no cargó (¿sin red?): los subtítulos salen con la tipografía del sistema.");
const shoot = async (text: string, where: Spot, name: string) => {
  await page.evaluate(
    ([value, at]) => {
      document.body.className = at;
      const p = document.querySelector("p")!;
      p.textContent = value;
      p.style.visibility = value ? "visible" : "hidden";
    },
    [text, where] as const,
  );
  await page.screenshot({ path: join(FOLDER, name), omitBackground: true });
};
await shoot("", "bottom", "nada.png");
for (const [index, subtitle] of subtitles.entries()) await shoot(subtitle.en, subtitle.spot, `${String(index + 1).padStart(2, "0")}.png`);
await browser.close();

/* La pista de subtítulos (una lista de imágenes con su duración) sobre el video. */

const total = await seconds(args.video);
const list: string[] = ["ffconcat version 1.0"];
let clock = 0;
const show = (name: string, until: number) => {
  if (until - clock < 0.001) return;
  list.push(`file ${name}`, `duration ${(until - clock).toFixed(3)}`);
  clock = until;
};
subtitles.forEach((subtitle, index) => {
  show("nada.png", subtitle.start);
  show(`${String(index + 1).padStart(2, "0")}.png`, Math.min(subtitle.end, total));
});
show("nada.png", total);
// La última imagen se repite: sin eso el concat ignora su duración.
list.push("file nada.png");
writeFileSync(join(FOLDER, "pista.ffconcat"), list.join("\n") + "\n");

await ffmpeg([
  ...["-i", resolve(args.video), "-f", "concat", "-safe", "0", "-i", join(FOLDER, "pista.ffconcat")],
  ...["-filter_complex", `[1:v]format=rgba[sub];[0:v][sub]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[video]`],
  ...["-map", "[video]", "-map", "0:a", "-c:v", "libx264", "-preset", args.preset, "-crf", "17", "-pix_fmt", "yuv420p", "-r", "60"],
  ...["-c:a", "copy", "-t", total.toFixed(3), "-movflags", "+faststart", resolve(args.salida)],
]);
console.log(`Listo: ${args.salida}`);
