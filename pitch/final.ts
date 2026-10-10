/**
 * El video entero: la parte A, la demo y la parte B en un solo archivo, con
 * las tres voces, los efectos de las animaciones y una sola cama de principio
 * a fin, para que el paso de una pieza a la otra no se oiga.
 *
 *   python3 pitch/sonido.py                  # deja también pitch/out/cama-final.wav
 *   bun pitch/final.ts                       # escribe pitch/out/nodus-final.mp4
 *
 * A y B van a 1,1× con el tono conservado (`setpts=PTS/1.1` y `atempo=1.1`); la
 * demo, a su velocidad. Entre pieza y pieza hay un fundido corto. La mezcla es
 * la de `mezclar.ts`: cada voz subida a −16 LUFS, la cama agachada bajo la voz,
 * los efectos sin agachar, y todo a −14 LUFS con picos bajo −1 dBTP.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ffmpeg, ffmpegReport } from "./ffmpeg.ts";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    demo: { type: "string", default: "pitch/out/demo-sin-voz.mp4" },
    salida: { type: "string", default: "pitch/out/nodus-final.mp4" },
    "musica-db": { type: "string", default: "-17" },
    "efectos-db": { type: "string", default: "-12" },
    /** `veryfast` para una prueba; el definitivo va con `slow`. */
    preset: { type: "string", default: "slow" },
  },
});

const SPEED = 1.1;
const FADE = 0.4;
const FPS = 60;
const FILES = {
  a: "pitch/out/pitch-A.mp4",
  demo: args.demo,
  b: "pitch/out/pitch-B.mp4",
  voiceA: "pitch/voz/A.mp3",
  voiceDemo: "pitch/out/demo-voz.wav",
  voiceB: "pitch/out/B-voz-normalizada.wav",
  effectsA: "pitch/out/efectos-A.wav",
  effectsB: "pitch/out/efectos-B.wav",
  bed: "pitch/out/cama-final.wav",
};
for (const path of Object.values(FILES)) if (!existsSync(resolve(path))) throw new Error(`Falta ${path}`);

async function seconds(path: string): Promise<number> {
  const report = await ffmpegReport(["-i", path, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
  const [, h, m, s] = [...report.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1)!;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Lo que hay que subirle a una voz para que quede en −16 LUFS, como en `mezclar.ts`. */
async function lift(path: string): Promise<number> {
  const heard = await ffmpegReport(["-i", path, "-vn", "-af", "ebur128", "-f", "null", "-"]);
  const measured = Number([...heard.matchAll(/^\s*I:\s+(-?[\d.]+) LUFS/gm)].at(-1)?.[1]);
  return Number.isFinite(measured) ? Math.max(-12, Math.min(40, -16 - measured)) : 0;
}

const [lengthA, lengthDemo, lengthB] = [(await seconds(FILES.a)) / SPEED, await seconds(FILES.demo), (await seconds(FILES.b)) / SPEED];
// Cada pieza empieza un fundido antes de que termine la anterior.
const startDemo = lengthA - FADE;
const startB = startDemo + lengthDemo - FADE;
const total = startB + lengthB;
// Medidas ya mezcladas, las tres piezas quedaban a un LU de distancia (A −14,9, demo −14,4, B −13,9 LUFS): este ajuste las iguala.
const TRIM = { a: 0.5, demo: 0, b: -0.5 };
const [liftA, liftDemo, liftB] = (await Promise.all([lift(FILES.voiceA), lift(FILES.voiceDemo), lift(FILES.voiceB)])).map(
  (gain, index) => gain + [TRIM.a, TRIM.demo, TRIM.b][index]!,
) as [number, number, number];
console.log(
  `A ${lengthA.toFixed(2)} s · demo ${lengthDemo.toFixed(2)} s (desde ${startDemo.toFixed(2)}) · B ${lengthB.toFixed(2)} s (desde ${startB.toFixed(2)}) · total ${total.toFixed(2)} s`,
);
console.log(`voces: A +${liftA.toFixed(1)} dB, demo +${liftDemo.toFixed(1)} dB, B +${liftB.toFixed(1)} dB`);

const FORMAT = "aformat=sample_rates=48000:channel_layouts=stereo";
const ms = (s: number) => Math.round(s * 1000);
const voice = (input: number, gain: number, speed: number, at: number, label: string) =>
  `[${input}:a]${FORMAT},volume=${gain.toFixed(1)}dB,alimiter=limit=0.9:level=disabled${speed === 1 ? "" : `,atempo=${speed}`},adelay=${ms(at)}:all=1[${label}]`;

const graph = [
  // La imagen: A y B más rápido, la demo tal cual, y un fundido entre una y otra.
  `[0:v]setpts=PTS/${SPEED},fps=${FPS},format=yuv420p[a]`,
  `[1:v]fps=${FPS},format=yuv420p[d]`,
  `[2:v]setpts=PTS/${SPEED},fps=${FPS},format=yuv420p[b]`,
  `[a][d]xfade=transition=fade:duration=${FADE}:offset=${startDemo.toFixed(3)}[ad]`,
  `[ad][b]xfade=transition=fade:duration=${FADE}:offset=${startB.toFixed(3)}[video]`,
  // Las voces, cada una en su lugar.
  voice(3, liftA, SPEED, 0, "va"),
  voice(4, liftDemo, 1, startDemo, "vd"),
  voice(5, liftB, SPEED, startB, "vb"),
  "[va][vd][vb]amix=inputs=3:duration=longest:normalize=0,asplit=2[voz][llave]",
  // Los efectos de las animaciones, a la velocidad de su parte.
  `[6:a]${FORMAT},atempo=${SPEED}[ea]`,
  `[7:a]${FORMAT},atempo=${SPEED},adelay=${ms(startB)}:all=1[eb]`,
  `[ea][eb]amix=inputs=2:duration=longest:normalize=0,volume=${Number(args["efectos-db"])}dB[efectos]`,
  // Una sola cama, que se agacha cuando hay voz.
  `[8:a]${FORMAT},volume=${Number(args["musica-db"])}dB[cama]`,
  "[cama][llave]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=600[agachada]",
  `[voz][agachada][efectos]amix=inputs=3:duration=longest:normalize=0,loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,atrim=end=${total.toFixed(3)}[audio]`,
];

await ffmpeg([
  ...["-i", FILES.a, "-i", FILES.demo, "-i", FILES.b],
  ...["-i", FILES.voiceA, "-i", FILES.voiceDemo, "-i", FILES.voiceB, "-i", FILES.effectsA, "-i", FILES.effectsB, "-i", FILES.bed],
  ...["-filter_complex", graph.join(";"), "-map", "[video]", "-map", "[audio]"],
  ...["-c:v", "libx264", "-preset", args.preset, "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS)],
  ...["-c:a", "aac", "-b:a", "320k", "-t", total.toFixed(3), "-movflags", "+faststart", resolve(args.salida)],
]);
const minutes = Math.floor(total / 60);
console.log(`Listo: ${args.salida} (${minutes}:${(total - minutes * 60).toFixed(1).padStart(4, "0")})`);
