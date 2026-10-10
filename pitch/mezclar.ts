/**
 * El video renderizado con su voz, y con música de cama y efectos si los hay.
 *
 * Junta `pitch/out/pitch.mp4` con `pitch/voz/voz.mp3` y, si existen,
 * `pitch/voz/musica.mp3`, que se agacha bajo la voz (sidechaincompress) y
 * queda unos 20 dB por debajo, y una pista de efectos (`--efectos`), que no
 * se agacha. La mezcla se normaliza a −14 LUFS con picos bajo −1 dBTP
 * (loudnorm) y sale a `pitch/out/pitch-con-audio.mp4`. El video no se
 * recodifica.
 *
 * `pitch/sonido.py` genera una cama y unos efectos por parte (`cama-A.wav`,
 * `efectos-A.wav`) colgados de los segundos de cada paso.
 *
 *     bun run pitch:mezclar
 *     bun run pitch:mezclar --video pitch/out/pitch-idea.mp4 --voz otra.mp3 --salida pitch/out/prueba.mp4
 *     bun run pitch:mezclar --video pitch/out/pitch-A.mp4 --voz pitch/voz/A.mp3 --musica pitch/out/cama-A.wav \
 *         --efectos pitch/out/efectos-A.wav --salida pitch/out/parte-A-sonido.mp4
 *
 * Es para ver el resultado y para el animatic: el corte final se monta en
 * Kdenlive (la demo, la cara, los subtítulos) y ahí la regla de −14 LUFS se
 * mide sobre la mezcla final.
 */
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ffmpeg, ffmpegReport } from "./ffmpeg";

const ROOT = resolve(import.meta.dir, "..");
const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    video: { type: "string", default: join(ROOT, "pitch/out/pitch.mp4") },
    voz: { type: "string", default: join(ROOT, "pitch/voz/voz.mp3") },
    musica: { type: "string", default: join(ROOT, "pitch/voz/musica.mp3") },
    efectos: { type: "string", default: "" },
    "musica-db": { type: "string", default: "-20" },
    "efectos-db": { type: "string", default: "-12" },
    salida: { type: "string", default: join(ROOT, "pitch/out/pitch-con-audio.mp4") },
  },
});

const [video, voice, music, out] = [args.video, args.voz, args.musica, args.salida].map((path) => resolve(path));
for (const [what, path] of [
  ["el video (bun run pitch:render)", video],
  ["la voz", voice],
] as const)
  if (!existsSync(path)) {
    console.error(`Falta ${what}: ${relative(ROOT, path)}`);
    process.exit(1);
  }
const withMusic = existsSync(music);
const effects = args.efectos ? resolve(args.efectos) : "";
if (effects && !existsSync(effects)) {
  console.error(`Falta la pista de efectos: ${relative(ROOT, effects)} (python3 pitch/sonido.py)`);
  process.exit(1);
}
const [musicDb, effectsDb] = [args["musica-db"], args["efectos-db"]].map(Number);

// Las voces se graban bajas (A.mp3 promedia −43 dBFS): se sube antes de sumarle nada, para que la cama y los
// efectos se midan contra una voz de verdad y no contra una grabación callada. `loudnorm` de una pasada no
// levanta una voz tan baja, así que se mide y se le da la ganancia que falta hasta −16 LUFS.
const heard = await ffmpegReport(["-i", voice, "-vn", "-af", "ebur128", "-f", "null", "-"]);
const measured = Number([...heard.matchAll(/^\s*I:\s+(-?[\d.]+) LUFS/gm)].at(-1)?.[1]);
const lift = Number.isFinite(measured) ? Math.max(-12, Math.min(40, -16 - measured)) : 0;
const LEVEL = `volume=${lift.toFixed(1)}dB,alimiter=limit=0.9:level=disabled`;

// La voz se parte en dos: una va a la mezcla y la otra le dice a la música cuándo agacharse.
// Los efectos entran como otra entrada, sin agacharse: son cortos y caen mientras se habla.
const FORMAT = "aformat=sample_rates=48000:channel_layouts=stereo";
const effectsInput = withMusic ? 3 : 2;
const loudness = "loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,apad[audio]";
const graph: string[] = [];
const mix = ["[voz]"];
if (withMusic) {
  graph.push(`[1:a]${FORMAT},${LEVEL},asplit=2[voz][llave]`, `[2:a]${FORMAT},volume=${musicDb}dB[cama]`);
  graph.push("[cama][llave]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=600[agachada]");
  mix.push("[agachada]");
} else graph.push(`[1:a]${FORMAT},${LEVEL}[voz]`);
if (effects) {
  graph.push(`[${effectsInput}:a]${FORMAT},volume=${effectsDb}dB[efectos]`);
  mix.push("[efectos]");
}
graph.push(mix.length > 1 ? `${mix.join("")}amix=inputs=${mix.length}:duration=longest:normalize=0,${loudness}` : `[voz]${loudness}`);

await ffmpeg([
  ...["-i", video, "-i", voice],
  // Una cama de música se repite hasta el final; una cama de `sonido.py` ya dura lo que el video.
  ...(withMusic ? [...(music.endsWith(".wav") ? [] : ["-stream_loop", "-1"]), "-i", music] : []),
  ...(effects ? ["-i", effects] : []),
  ...["-filter_complex", graph.join(";"), "-map", "0:v", "-map", "[audio]"],
  ...["-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", out],
]);
console.log(
  `voz: ${measured} LUFS, subida ${lift.toFixed(1)} dB\n→ ${relative(ROOT, out)}${withMusic ? " (con música)" : ""}${effects ? " (con efectos)" : ""}`,
);
