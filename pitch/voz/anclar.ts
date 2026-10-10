/**
 * Pone cada paso de /pitch a la hora en que la voz llega a él.
 *
 * Lee `anclas.json` (la frase que dice la voz en cada paso, y los pasos fijos
 * sin voz) y `palabras.json` (cada palabra de `voz.mp3` con su segundo, de
 * `alinear.py`), busca cada frase en orden entre las palabras y escribe
 * `tiempos.json` aquí y la copia que importa la app, en
 * `apps/web/src/components/pitch/tiempos.json`. Copia también la voz a
 * `apps/web/public/pitch/voz.mp3`, para que `/pitch` la toque.
 *
 *     bun run pitch:anclar               # con palabras.json, si está
 *     bun run pitch:anclar --estimados   # los tiempos de guion.md, sin voz
 *
 * Sin voz ni palabras solo revisa que `anclas.json` nombre todos los pasos y
 * nada más, y sale sin escribir. Otras opciones: `--palabras <archivo>` y
 * `--salida <archivo>` (escribe solo ahí, para probar sin tocar nada).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { SCENES, type SceneId } from "../../apps/web/src/components/pitch/scenes";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../..");
const APP_COPY = join(ROOT, "apps/web/src/components/pitch/tiempos.json");
const VOICE = join(HERE, "voz.mp3");
const PUBLIC_VOICE = join(ROOT, "apps/web/public/pitch/voz.mp3");

interface Fixed {
  escena: SceneId;
  paso: number;
  t: number;
  nota?: string;
}
interface Anchor {
  escena: SceneId;
  paso: number;
  frase: string;
  /** La hora estimada, sin voz. */
  t: number;
  /** El paso va un respiro después de la última palabra de la frase, no antes de la primera. */
  despues?: boolean;
}
interface Anchors {
  adelanto: number;
  respiro: number;
  cola: number;
  fin: number;
  fijos: Fixed[];
  anclas: Anchor[];
}
interface Word {
  word: string;
  start: number;
  end: number;
}
type Origin = "voz" | "fijo" | "estimado" | "interpolado";
interface Cue {
  escena: SceneId;
  paso: number;
  t: number;
  origen: Origin;
}

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    estimados: { type: "boolean", default: false },
    palabras: { type: "string", default: join(HERE, "palabras.json") },
    salida: { type: "string" },
    parte: { type: "string" },
  },
});

const round = (value: number) => Math.round(value * 1000) / 1000;
const where = (cue: { escena: string; paso: number }) => `${cue.escena}.${cue.paso}`;

/* Revisar las anclas. */

const anchors: Anchors = JSON.parse(readFileSync(join(HERE, "anclas.json"), "utf8"));
const partA = args.parte === "A";
const partB = args.parte === "B";
if (args.parte && !partA && !partB) throw new Error("La opción --parte admite A o B; sin ella se ancla la voz principal.");
const previous = args.parte ? (JSON.parse(readFileSync(join(HERE, "tiempos.json"), "utf8")) as { pasos: Cue[]; fin: number }) : null;
const isB = (cue: { escena: string }) => ["veinte", "stellar", "cierre"].includes(cue.escena);
const isA = (cue: { escena: string }) => cue.escena !== "demo" && !isB(cue);
const offset = previous?.pasos.find((cue) => cue.escena === "veinte" && cue.paso === 0)?.t ?? 0;
const problems: string[] = [];
const seen = new Map<string, string>();
for (const entry of [...anchors.fijos, ...anchors.anclas]) {
  const scene = SCENES.find((candidate) => candidate.id === entry.escena);
  if (!scene) problems.push(`${where(entry)}: no hay escena "${entry.escena}"`);
  else if (!Number.isInteger(entry.paso) || entry.paso < 0 || entry.paso >= scene.steps.length)
    problems.push(`${where(entry)}: la escena tiene ${scene.steps.length} pasos (0 a ${scene.steps.length - 1})`);
  if (typeof entry.t !== "number") problems.push(`${where(entry)}: falta su hora estimada, t`);
  if (seen.has(where(entry))) problems.push(`${where(entry)}: está dos veces`);
  seen.set(where(entry), "");
}
for (const scene of SCENES)
  scene.steps.forEach((_, step) => {
    if (!seen.has(`${scene.id}.${step}`)) problems.push(`${scene.id}.${step}: ningún ancla ni fijo lo pone en el tiempo`);
  });
const estimated = [...anchors.anclas].map((anchor) => anchor.t);
if (estimated.some((t, index) => index > 0 && t <= estimated[index - 1]!))
  problems.push("las horas estimadas de las anclas tienen que ir en el orden en que se dicen");
if (problems.length > 0) {
  console.error(`anclas.json tiene problemas:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
// Each recorded part is aligned on its own. Preserve the already rendered part A and the demo marker.
if (partB) {
  anchors.anclas = anchors.anclas.filter(isB);
  anchors.fijos = [];
}
if (partA) {
  anchors.anclas = anchors.anclas.filter(isA);
  anchors.fijos = anchors.fijos.filter(isA);
}

/* Normalizar lo que se dice: minúsculas, sin tildes ni puntuación, y las cifras en palabras. */

const UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const TEENS = [
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidos",
  "veintitres",
  "veinticuatro",
  "veinticinco",
  "veintiseis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

/** Una cifra como se dice, hasta 999 999. */
export function spoken(value: number): string {
  if (value < 10) return UNITS[value]!;
  if (value < 30) return TEENS[value - 10]!;
  if (value < 100) return TENS[Math.floor(value / 10)]! + (value % 10 ? ` y ${UNITS[value % 10]}` : "");
  if (value === 100) return "cien";
  if (value < 1000) return HUNDREDS[Math.floor(value / 100)]! + (value % 100 ? ` ${spoken(value % 100)}` : "");
  const thousands = Math.floor(value / 1000);
  return `${thousands === 1 ? "mil" : `${spoken(thousands)} mil`}${value % 1000 ? ` ${spoken(value % 1000)}` : ""}`;
}

/** Lo que dice un trozo de texto, palabra por palabra, en la forma en que se comparan. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/%/g, " por ciento ")
    .replace(/(\d)[.,](?=\d{3}\b)/g, "$1")
    .replace(/\d+/g, (digits) => ` ${spoken(Number(digits))} `)
    .replace(/[^a-zñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Cuánto se parecen dos palabras, de 0 a 1, por la distancia de edición. */
function likeness(a: string, b: string): number {
  if (a === b) return 1;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - row[b.length]! / Math.max(a.length, b.length);
}

const SAME = 0.7;

/**
 * Cuánto de una frase se oye desde la palabra `start`: la frase se alinea
 * con las palabras que siguen, dejando pasar palabras de más o de menos
 * (lo que el oído de Whisper confundió), y se cuenta qué parte de ella
 * apareció en orden. Devuelve también la última palabra que coincidió.
 */
function heardFrom(phrase: string[], words: { token: string }[], start: number) {
  const span = Math.min(words.length - start, phrase.length + 4);
  // best[i][j]: cuánto coincide la frase hasta i con las palabras hasta j; last[i][j]: la última palabra que coincidió.
  const best = Array.from({ length: phrase.length + 1 }, () => new Array<number>(span + 1).fill(0));
  const last = Array.from({ length: phrase.length + 1 }, () => new Array<number>(span + 1).fill(start));
  for (let i = 1; i <= phrase.length; i++)
    for (let j = 1; j <= span; j++) {
      const same = likeness(words[start + j - 1]!.token, phrase[i - 1]!) >= SAME;
      const options: [number, number][] = [
        [best[i - 1]![j]!, last[i - 1]![j]!],
        [best[i]![j - 1]!, last[i]![j - 1]!],
      ];
      if (same) options.push([best[i - 1]![j - 1]! + 1, start + j - 1]);
      const [score, at] = options.reduce((a, b) => (b[0] > a[0] ? b : a));
      [best[i]![j], last[i]![j]] = [score, at];
    }
  return { score: best[phrase.length]![span]! / phrase.length, last: last[phrase.length]![span]! };
}

/**
 * Dónde se dice una frase en la voz, desde la palabra `from`, empezando
 * donde se oye su primera palabra (o la segunda). La primera posición que
 * pasa de 0,8 gana; si ninguna, la mejor sobre 0,55, como dudosa.
 */
function find(phrase: string[], words: { token: string }[], from: number) {
  let best: { score: number; first: number; last: number; skipped: number } | null = null;
  for (let start = from; start < words.length; start++) {
    const skipped = likeness(words[start]!.token, phrase[0]!) >= SAME ? 0 : likeness(words[start]!.token, phrase[1] ?? "") >= SAME ? 1 : -1;
    if (skipped < 0) continue;
    const { score, last } = heardFrom(phrase, words, start);
    if (score >= 0.8) return { score, first: start, last, skipped };
    if (score >= 0.55 && (!best || score > best.score)) best = { score, first: start, last, skipped };
  }
  return best;
}

/** Lo que tarda en decirse una palabra, para cuando la frase se oye desde la segunda. */
const WORD = 0.3;

/* Sin voz: revisar y salir, o escribir los estimados. */

function write(cues: Cue[], fin: number, source: string) {
  if (partA && previous) {
    // A has its own recording. Move the demo and B together, preserving B's
    // already approved relative timings and the existing demo window.
    const oldEnd = previous.pasos.find((cue) => cue.escena === "demo")?.t;
    if (oldEnd === undefined) throw new Error("Falta el límite de A: demo.0.");
    const duration = args.estimados ? oldEnd : JSON.parse(readFileSync(args.palabras, "utf8")).duracion;
    if (!(duration > Math.max(...cues.map((cue) => cue.t)))) throw new Error("La duración de A no alcanza a cubrir sus anclas.");
    const shift = duration - oldEnd;
    cues = [...cues, ...previous.pasos.filter((cue) => !isA(cue)).map((cue) => ({ ...cue, t: cue.t + shift }))];
    fin = previous.fin + shift;
  }
  if (partB && previous) {
    cues = [...previous.pasos.filter((cue) => !isB(cue)), ...cues.map((cue) => ({ ...cue, t: cue.t + offset }))];
    fin += offset;
  }
  cues.sort((a, b) => a.t - b.t);
  const out = {
    $comment:
      "Generado por pitch/voz/anclar.ts desde pitch/voz/anclas.json: no editar a mano. La fuente es pitch/voz/tiempos.json; apps/web/src/components/pitch/tiempos.json es su copia para la app.",
    fuente: source,
    fin: round(fin),
    pasos: cues.map((cue) => ({ ...cue, t: round(cue.t) })),
  };
  const text = JSON.stringify(out, null, 2) + "\n";
  const targets = args.salida ? [resolve(args.salida)] : [join(HERE, "tiempos.json"), APP_COPY];
  for (const target of targets) writeFileSync(target, text);
  console.log(`${cues.length} pasos, fin a los ${round(fin)} s → ${targets.map((target) => relative(ROOT, target)).join(", ")}`);
}

const fixedCues: Cue[] = anchors.fijos.map((fixed) => ({ escena: fixed.escena, paso: fixed.paso, t: fixed.t, origen: "fijo" }));

if (args.estimados) {
  write(
    [...fixedCues, ...anchors.anclas.map((anchor): Cue => ({ escena: anchor.escena, paso: anchor.paso, t: anchor.t, origen: "estimado" }))],
    anchors.fin,
    "estimados",
  );
  process.exit(0);
}

if (!existsSync(args.palabras)) {
  console.log(
    `anclas.json está bien: ${seen.size} pasos. ${existsSync(VOICE) ? "Falta palabras.json: corre antes alinear.py." : "No hay voz en pitch/voz/voz.mp3: nada que anclar."}`,
  );
  process.exit(0);
}

/* Con voz: buscar cada frase en orden. */

const mainVoice = partA ? join(HERE, "A.mp3") : VOICE;
if (!partB && existsSync(mainVoice) && !args.salida) {
  const fresh = !existsSync(PUBLIC_VOICE) || statSync(PUBLIC_VOICE).mtimeMs < statSync(mainVoice).mtimeMs;
  if (fresh) {
    mkdirSync(dirname(PUBLIC_VOICE), { recursive: true });
    copyFileSync(mainVoice, PUBLIC_VOICE);
    console.log(`voz copiada a ${relative(ROOT, PUBLIC_VOICE)}`);
  }
}
if (partB && !args.salida) {
  mkdirSync(dirname(PUBLIC_VOICE), { recursive: true });
  copyFileSync(join(HERE, "B.mp3"), join(dirname(PUBLIC_VOICE), "B.mp3"));
}

const heard: { palabras: Word[]; duracion?: number } = JSON.parse(readFileSync(args.palabras, "utf8"));
// Una palabra como "270" son dos al decirla: se reparte su tiempo entre ellas.
// Whisper a veces le cuelga a una palabra el silencio que la precede: ninguna dura más de lo que tardan sus letras.
const longest = (word: string) => 0.12 + 0.07 * word.length;
const words = heard.palabras.flatMap((word) => {
  const parts = tokens(word.word);
  const start = Math.max(word.start, word.end - longest(parts.join("")) * 1.2);
  const each = (word.end - start) / Math.max(1, parts.length);
  return parts.map((token, index) => ({ token, at: start + index * each, end: start + (index + 1) * each }));
});

const found: (Cue | null)[] = [];
const report: string[] = [];
let cursor = 0;
for (const anchor of anchors.anclas) {
  const phrase = tokens(anchor.frase);
  // B's anchors come from its actual transcript. Exact matching prevents short
  // phrases such as "Esto es Nodus" from matching the preceding receipt line.
  const exact = partB
    ? words.findIndex((_, index) => index >= cursor && phrase.every((token, j) => words[index + j]?.token === token))
    : -1;
  const match = partB
    ? exact < 0
      ? null
      : { score: 1, first: exact, last: exact + phrase.length - 1, skipped: 0 }
    : find(phrase, words, cursor);
  if (!match) {
    found.push(null);
    report.push(`  no está   ${where(anchor).padEnd(12)} «${anchor.frase}»`);
    continue;
  }
  cursor = match.last + 1;
  const t = anchor.despues ? words[match.last]!.end + anchors.respiro : words[match.first]!.at - match.skipped * WORD - anchors.adelanto;
  found.push({ escena: anchor.escena, paso: anchor.paso, t: Math.max(0, t), origen: "voz" });
  if (match.score < 0.8)
    report.push(`  dudosa    ${where(anchor).padEnd(12)} «${anchor.frase}» (${Math.round(match.score * 100)} %) a los ${round(t)} s`);
}

// Lo que no se encontró va entre las dos anclas encontradas que lo rodean, en la proporción de las horas estimadas.
const cues = anchors.anclas.map((anchor, index): Cue => {
  const hit = found[index];
  if (hit) return hit;
  const before = found.slice(0, index).findLastIndex(Boolean);
  const after = found.findIndex((cue, other) => other > index && cue);
  const [a, b] = [anchors.anclas[before], anchors.anclas[after]];
  const [ta, tb] = [found[before]?.t, found[after]?.t];
  let t = anchor.t;
  if (a && b && ta !== undefined && tb !== undefined) t = ta + ((anchor.t - a.t) / (b.t - a.t)) * (tb - ta);
  else if (a && ta !== undefined) t = ta + (anchor.t - a.t);
  else if (b && tb !== undefined) t = tb - (b.t - anchor.t);
  return { escena: anchor.escena, paso: anchor.paso, t, origen: "interpolado" };
});

const lastWord = heard.palabras.at(-1);
const all = [...fixedCues, ...cues];
// La voz puede no llegar todavía al final del guion: el video termina después de su último paso, lo diga la voz o no.
const fin = Math.max(lastWord ? lastWord.end + anchors.cola : anchors.fin, ...all.map((cue) => cue.t + anchors.cola));
const ordered = [...all].sort((a, b) => a.t - b.t);
const disorder = ordered.findIndex((cue, index) => index > 0 && cue.t - ordered[index - 1]!.t < 0.3);
if (disorder > 0)
  report.push(
    `  muy juntos ${where(ordered[disorder - 1]!)} y ${where(ordered[disorder]!)}: ${round(ordered[disorder]!.t - ordered[disorder - 1]!.t)} s`,
  );
const outOfOrder = cues.findIndex((cue, index) => index > 0 && cue.t < cues[index - 1]!.t);
if (outOfOrder > 0) report.push(`  fuera de orden: ${where(cues[outOfOrder]!)} cae antes que ${where(cues[outOfOrder - 1]!)}`);

const hits = found.filter(Boolean).length;
if (args.parte && hits !== anchors.anclas.length)
  throw new Error(`Faltan frases de ${args.parte}: revisa las anclas antes de sobrescribir sus tiempos.\n` + report.join("\n"));
console.log(`${hits} de ${anchors.anclas.length} anclas encontradas en ${relative(ROOT, resolve(args.palabras))}.`);
if (report.length > 0) console.log(report.join("\n"));
write(all, partB ? Math.max(fin, heard.duracion ?? 0) : fin, "voz");
