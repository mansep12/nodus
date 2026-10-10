/**
 * La voz del video entera, de las partes grabadas una por una.
 *
 * La voz se graba por parte, de corrido (`A.mp3` es todo lo que va antes de
 * la demo). Esto las pega en orden, sin agregar nada entre una y otra, y
 * escribe `voz.mp3`, que es lo que transcribe `alinear.py`, ancla
 * `anclar.ts` y toca `/pitch`. Se detiene en la primera parte que falte: lo
 * que hay hasta ahí es la voz.
 *
 * No agrega silencio: el silencio digital suena a corte, no a pausa. Si una
 * pausa tiene que ser más larga, se graba más larga o se alarga con el
 * sonido de sala de la misma grabación.
 *
 *     bun run pitch:juntar
 *     uv run pitch/voz/alinear.py
 *     bun run pitch:anclar
 */
import { copyFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ffmpeg } from "../ffmpeg";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../..");

/** Las partes en el orden en que se dicen. */
const PARTS = ["A"];

const found: string[] = [];
for (const name of PARTS) {
  const path = join(HERE, `${name}.mp3`);
  if (!existsSync(path)) {
    console.log(`Falta ${name}.mp3: la voz llega hasta la parte anterior.`);
    break;
  }
  found.push(path);
}
if (found.length === 0) {
  console.error("No hay ninguna parte en pitch/voz/ (A.mp3…).");
  process.exit(1);
}

const out = join(HERE, "voz.mp3");
// Una sola parte se copia tal cual, sin volver a codificarla.
if (found.length === 1) copyFileSync(found[0]!, out);
else {
  const inputs = found.map((_, index) => `[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`);
  const joined = `${found.map((_, index) => `[a${index}]`).join("")}concat=n=${found.length}:v=0:a=1[voz]`;
  await ffmpeg([
    ...found.flatMap((path) => ["-i", path]),
    ...["-filter_complex", [...inputs, joined].join(";"), "-map", "[voz]", "-c:a", "libmp3lame", "-b:a", "192k", out],
  ]);
}
console.log(`${found.length === 1 ? "1 parte" : `${found.length} partes`} → ${relative(ROOT, out)}`);
