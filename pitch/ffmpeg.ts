/**
 * ffmpeg para los scripts del video: el de `$FFMPEG`, el del PATH o, si no
 * hay, el del runtime de Flatpak `org.freedesktop.Platform` (trae libx264,
 * loudnorm y sidechaincompress). El de Flatpak no ve `/tmp`: los archivos que
 * se le pasan tienen que estar fuera de ahí, como `pitch/out/`.
 */
import { existsSync } from "node:fs";

function command(): string[] {
  if (process.env.FFMPEG) return process.env.FFMPEG.split(" ");
  if (Bun.which("ffmpeg")) return ["ffmpeg"];
  if (Bun.which("flatpak") && existsSync("/var/lib/flatpak/runtime/org.freedesktop.Platform"))
    return ["flatpak", "run", "--filesystem=host", "--command=ffmpeg", "org.freedesktop.Platform//25.08"];
  throw new Error("No encuentro ffmpeg: instálalo o di dónde está con FFMPEG=/ruta/ffmpeg.");
}

/** Corre ffmpeg con estos argumentos y falla si ffmpeg falla. */
export async function ffmpeg(args: string[]): Promise<void> {
  const run = Bun.spawn(
    [...command(), "-hide_banner", "-loglevel", "error", ...(process.env.FFMPEG_CALLADO ? ["-nostats"] : ["-stats"]), "-y", ...args],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if ((await run.exited) !== 0) throw new Error(`ffmpeg terminó con ${run.exitCode}`);
}

/** Corre ffmpeg y devuelve lo que escribió en stderr: ahí salen las mediciones de `ebur128`. */
export async function ffmpegReport(args: string[]): Promise<string> {
  const run = Bun.spawn([...command(), "-hide_banner", "-nostats", "-y", ...args], { stdout: "ignore", stderr: "pipe" });
  const report = await new Response(run.stderr).text();
  if ((await run.exited) !== 0) throw new Error(`ffmpeg terminó con ${run.exitCode}:\n${report}`);
  return report;
}
