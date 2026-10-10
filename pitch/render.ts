/**
 * El video de /pitch, cuadro por cuadro, sin grabar la pantalla.
 *
 * Levanta `next dev` (con el Node de verdad y un puerto libre), abre
 * `/pitch?render=1` en un Chromium sin ventana a 1920×1080 y lo hace avanzar
 * de a un cuadro: el reloj del video lo pone el script (`window.__pitch.tick`)
 * y el tiempo del navegador también (tiempo virtual de Chrome y un BeginFrame
 * por cuadro), así que cada cuadro sale igual cada vez. Los cuadros quedan en
 * `pitch/out/frames/` y ffmpeg los junta en `pitch/out/pitch.mp4` (H.264, CRF
 * 17, yuv420p, faststart).
 *
 *     bun run pitch:render                         # todo, a 60 fps
 *     bun run pitch:render --desde 35 --hasta 48   # un tramo, en segundos
 *     bun run pitch:render --escena veinte         # una escena
 *     bun run pitch:render --fps 30                # otra cadencia
 *     bun run pitch:render --muestras 4            # desenfoque de movimiento: 4 subcuadros por cuadro
 *     bun run pitch:render --verificar             # lo renderiza dos veces y compara cuadro a cuadro
 *     bun run pitch:render stills --t 12.5,40.2    # cuadros sueltos, a pitch/out/wip/
 *     bun run pitch:render --url http://localhost:3002   # usar un servidor que ya corre
 *
 * Un tramo que no empieza en 0 se "pre-rueda": la página abre unos segundos
 * antes, en un paso anterior, y avanza sin capturar hasta el primer cuadro,
 * para que lo que estaba entrando ya haya entrado como en el video entero.
 */
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ffmpeg } from "./ffmpeg";

const ROOT = resolve(import.meta.dir, "..");
const WEB = join(ROOT, "apps/web");
const OUT = join(ROOT, "pitch/out");
const FRAME = { width: 1920, height: 1080 };

const { values: args, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    desde: { type: "string" },
    hasta: { type: "string" },
    fps: { type: "string", default: "60" },
    escena: { type: "string" },
    parte: { type: "string" },
    // Desde qué segundo abrir la página, si el pre-rodaje de siempre no alcanza (ver `prerollFor`).
    abrir: { type: "string" },
    muestras: { type: "string", default: "1" },
    t: { type: "string" },
    url: { type: "string" },
    verificar: { type: "boolean", default: false },
    // Para --verificar: la segunda pasada corre en otro proceso (dos Chromium seguidos en uno se traban), a otra carpeta y sin video.
    carpeta: { type: "string" },
    "sin-video": { type: "boolean", default: false },
  },
});

const stills = positionals[0] === "stills";
const fps = Number(args.fps);
const samples = Math.max(1, Math.round(Number(args.muestras)));

/* La línea de tiempo, la misma que lee la página. */

interface Cue {
  escena: string;
  paso: number;
  t: number;
}
const TIMES: { fin: number; pasos: Cue[] } = JSON.parse(readFileSync(join(WEB, "src/components/pitch/tiempos.json"), "utf8"));
const CUES = [...TIMES.pasos].sort((a, b) => a.t - b.t);
const END = Math.max(TIMES.fin, CUES.at(-1)?.t ?? 0);
const cueAt = (t: number) => CUES.filter((cue) => cue.t <= t).at(-1) ?? CUES[0]!;

/** Desde dónde abrir la página para que el cuadro `t` salga como en el video entero. */
function prerollFor(t: number): number {
  // Para abrir antes de un movimiento que el pre-rodaje de siempre dejaría a medias.
  if (args.abrir !== undefined) return Math.min(t, Number(args.abrir));
  const b = CUES.find((cue) => cue.escena === "veinte" && cue.paso === 0)?.t;
  // B is a separate clip after the recorded demo: open on its own camera,
  // without dragging the previous scene's labels through its first frame.
  if (b !== undefined && t >= b && t < b + 4) return b;
  if (t < 4) return 0;
  // El paso en pantalla tiene que haber entrado desde el anterior, y lo que se monta al abrir tiene que haber terminado de entrar.
  const settle = Math.min(t, cueAt(t).t) - 4;
  return CUES.filter((cue) => cue.t <= settle).at(-1)?.t ?? 0;
}

/** Lo que hay que capturar, en segundos del video. */
function targets(): { times: number[]; name: string | null; from: number; to: number } {
  if (stills) {
    const times = (args.t ?? "")
      .split(",")
      .map(Number)
      .filter((t) => Number.isFinite(t) && t >= 0 && t <= END)
      .sort((a, b) => a - b);
    if (times.length === 0) throw new Error("stills necesita --t con uno o más segundos, como --t 12.5,40.2");
    return { times, name: null, from: times[0]!, to: times.at(-1)! };
  }
  let [from, to] = [Number(args.desde ?? 0), Number(args.hasta ?? END)];
  let name = args.desde || args.hasta ? `pitch-${from}-${to}` : "pitch";
  if (args.parte) {
    if (args.parte !== "A" && args.parte !== "B") throw new Error("--parte admite A o B.");
    from = args.parte === "A" ? 0 : CUES.find((cue) => cue.escena === "veinte" && cue.paso === 0)!.t;
    to = args.parte === "A" ? CUES.find((cue) => cue.escena === "demo" && cue.paso === 0)!.t : END;
    name = `pitch-${args.parte}`;
  }
  if (args.escena) {
    const first = CUES.findIndex((cue) => cue.escena === args.escena);
    if (first < 0) throw new Error(`No hay escena "${args.escena}" en la línea de tiempo.`);
    let last = first;
    while (CUES[last + 1]?.escena === args.escena) last++;
    [from, to] = [CUES[first]!.t, CUES[last + 1]?.t ?? END];
    name = `pitch-${args.escena}`;
    if (CUES.slice(last + 1).some((cue) => cue.escena === args.escena))
      console.log(`"${args.escena}" aparece más de una vez en el video: va la primera (${from}–${to} s). Para otra, --desde y --hasta.`);
  }
  from = Math.max(0, from);
  to = Math.min(END, to);
  if (!(to > from)) throw new Error(`El tramo está vacío: de ${from} a ${to} s.`);
  const step = 1 / (fps * samples);
  const count = Math.round((to - from) * fps) * samples;
  return { times: Array.from({ length: count }, (_, index) => from + index * step), name, from, to };
}

/* El servidor. */

/** El Node de verdad: en esta máquina `node` en el PATH es el de Bun, que no corre `next dev`. */
function realNode(): string {
  if (process.env.PITCH_NODE) return process.env.PITCH_NODE;
  const nvm = join(homedir(), ".nvm/versions/node");
  if (existsSync(nvm)) {
    const versions = readdirSync(nvm).sort((a, b) => Bun.semver.order(b.replace(/^v/, ""), a.replace(/^v/, "")));
    for (const version of versions) if (existsSync(join(nvm, version, "bin/node"))) return join(nvm, version, "bin/node");
  }
  const found = Bun.which("node");
  if (!found || found.includes(".bun")) throw new Error("No encuentro Node (no el de Bun): di cuál con PITCH_NODE=/ruta/node.");
  return found;
}

function freePort(): number {
  const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = probe.port;
  probe.stop(true);
  return port;
}

/** Las variables de un archivo .env, sin interpretar nada raro. */
function envFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2")]),
  );
}

async function server(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (args.url) return { url: args.url.replace(/\/$/, ""), stop: async () => {} };
  // `next dev` con otra carpeta de compilación anota esa carpeta en tsconfig.json y next-env.d.ts: se dejan como estaban.
  const touched = ["tsconfig.json", "next-env.d.ts"].map((file) => join(WEB, file));
  const before = touched.map((path) => (existsSync(path) ? readFileSync(path, "utf8") : null));
  const port = freePort();
  const url = `http://localhost:${port}`;
  mkdirSync(OUT, { recursive: true });
  const log = join(OUT, "next-render.log");
  console.log(`next dev en ${url} (registro en ${relative(ROOT, log)})`);
  const child = Bun.spawn([realNode(), "node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    cwd: WEB,
    env: { ...process.env, ...envFile(join(WEB, ".env.sandbox")), NEXT_DIST_DIR: ".next-render", NODUS_DATA_DIR: ".data-render" },
    stdout: Bun.file(log),
    stderr: Bun.file(log),
  });
  const stop = async () => {
    child.kill("SIGTERM");
    await Promise.race([child.exited, Bun.sleep(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
    touched.forEach((path, index) => {
      const text = before[index];
      if (text !== null && text !== undefined && (!existsSync(path) || readFileSync(path, "utf8") !== text)) writeFileSync(path, text);
    });
  };
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev se cerró; mira ${relative(ROOT, log)}`);
    const ok = await fetch(`${url}/pitch`)
      .then((response) => response.ok)
      .catch(() => false);
    if (ok) return { url, stop };
    await Bun.sleep(1000);
  }
  await stop();
  throw new Error("next dev no respondió en cuatro minutos");
}

/* El navegador. */

/** El Chromium sin ventana de Playwright ("headless shell"): el único que acepta BeginFrame. */
function chromiumPath(): string {
  if (process.env.PITCH_CHROMIUM) return process.env.PITCH_CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright");
  const shells = existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => name.startsWith("chromium_headless_shell-"))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const shell of shells) {
    const path = join(cache, shell, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(path)) return path;
  }
  throw new Error("No encuentro chrome-headless-shell: bunx playwright-core install chromium-headless-shell, o PITCH_CHROMIUM=/ruta.");
}

/** Los segundos de Linux desde que arrancó, en ms: el reloj en que Chrome cuenta los cuadros. */
const uptime = () => Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000;

declare global {
  interface Window {
    __pitch?: { ready: boolean; tick: (t: number) => void };
  }
}

interface Player {
  /** Pone el video en `t`, deja correr `dt` segundos del navegador y dibuja un cuadro; con `shot`, lo devuelve en PNG. */
  frame: (t: number, dt: number, shot: boolean) => Promise<Buffer | null>;
  close: () => Promise<void>;
}

async function open(url: string, start: number): Promise<Player> {
  const profile = mkdtempSync(join(tmpdir(), "pitch-render-"));
  const context: BrowserContext = await chromium.launchPersistentContext(profile, {
    executablePath: chromiumPath(),
    headless: true,
    viewport: FRAME,
    deviceScaleFactor: 1,
    args: [
      "--deterministic-mode",
      "--enable-begin-frame-control",
      "--run-all-compositor-stages-before-draw",
      "--disable-threaded-animation",
      "--disable-threaded-scrolling",
      "--disable-checker-imaging",
      "--disable-new-content-rendering-timeout",
      // Rasterizar en un solo hilo y sin GPU, por si acaso: menos cosas que puedan cambiar de un render a otro.
      "--disable-gpu",
      "--num-raster-threads=1",
      "--disable-partial-raster",
      "--hide-scrollbars",
      "--mute-audio",
    ],
  });
  // Una pestaña cuyos cuadros solo se dibujan cuando el script los pide.
  const opener = context.pages()[0] ?? (await context.newPage());
  const created = context.waitForEvent("page");
  await (await context.newCDPSession(opener)).send("Target.createTarget", { url: "about:blank", enableBeginFrameControl: true } as never);
  const page: Page = await created;
  await page.setViewportSize(FRAME);
  // motion le pasa la opacidad y las transformaciones a las animaciones del navegador (WAAPI), que
  // arrancan con un reloj que no es el virtual y variaban de un render a otro. Sin ellas, motion anima
  // todo en su propio ciclo de cuadros, que mueve el reloj virtual, y cada cuadro sale siempre igual.
  await page.addInitScript(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
  });
  const cdp: CDPSession = await context.newCDPSession(page);
  const begin = (params: Record<string, unknown>) =>
    cdp.send("HeadlessExperimental.beginFrame" as never, params as never) as Promise<{ screenshotData?: string }>;

  // Mientras carga, los cuadros corren al ritmo del reloj de verdad.
  let loading = true;
  const pump = (async () => {
    while (loading) {
      await begin({ noDisplayUpdates: true }).catch(() => {});
      await Bun.sleep(16);
    }
  })();
  await page.goto(`${url}/pitch?render=1&t=${start}`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForFunction(() => window.__pitch?.ready, null, { timeout: 120_000, polling: 100 });
  await page.evaluate(() => Promise.all([...document.fonts].map((face) => face.load().catch(() => null))));
  // El botón de Next en desarrollo no va en el video.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  loading = false;
  await pump;

  // Desde aquí el tiempo del navegador solo avanza cuando el script lo dice.
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  let ticks = uptime() + 1000;
  let last: Buffer | null = null;
  const advance = (ms: number) =>
    new Promise<void>((done) => {
      cdp.once("Emulation.virtualTimeBudgetExpired", () => done());
      void cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms });
    });

  return {
    frame: async (t, dt, shot) => {
      await page.evaluate((at) => window.__pitch!.tick(at), t);
      await advance(dt * 1000);
      ticks += dt * 1000;
      const result = await begin({
        frameTimeTicks: ticks,
        interval: dt * 1000,
        noDisplayUpdates: !shot,
        ...(shot ? { screenshot: { format: "png" } } : {}),
      });
      if (!shot) return null;
      // Sin nada nuevo que dibujar, Chrome no devuelve imagen: el cuadro es el de antes.
      if (result.screenshotData) last = Buffer.from(result.screenshotData, "base64");
      return last;
    },
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/* Renderizar. */

/** Avanza el video de `from` a `to` sin capturar: a 15 cuadros por segundo hasta 3 s antes, y de ahí a la cadencia del video. */
async function roll(player: Player, from: number, to: number) {
  const fine = 1 / (fps * samples);
  let t = from;
  while (to - t > 3) {
    await player.frame(t, 1 / 15, false);
    t += 1 / 15;
  }
  while (to - t > fine / 2) {
    await player.frame(t, fine, false);
    t += fine;
  }
}

async function pass(url: string, times: number[], into: string): Promise<string[]> {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  const start = prerollFor(times[0]!);
  const player = await open(url, start);
  const written: string[] = [];
  const began = performance.now();
  try {
    let at = start;
    for (const [index, t] of times.entries()) {
      const dt = 1 / (fps * samples);
      if (t - at > dt * 1.5) await roll(player, at, t);
      const png = await player.frame(t, dt, true);
      at = t + dt;
      if (!png) throw new Error(`El cuadro de los ${t} s salió vacío.`);
      const file = join(into, `${String(index).padStart(6, "0")}.png`);
      await Bun.write(file, png);
      written.push(file);
      if (!stills && (index % 120 === 119 || index === times.length - 1)) {
        const each = (performance.now() - began) / (index + 1);
        const left = ((times.length - index - 1) * each) / 1000;
        console.log(
          `  ${index + 1}/${times.length} cuadros · ${t.toFixed(2)} s · ${each.toFixed(0)} ms por cuadro · faltan ${left.toFixed(0)} s`,
        );
      }
    }
  } finally {
    await player.close();
  }
  console.log(`${written.length} cuadros en ${((performance.now() - began) / 1000).toFixed(1)} s → ${relative(ROOT, into)}/`);
  return written;
}

const hash = (path: string) => createHash("sha1").update(readFileSync(path)).digest("hex");

async function main() {
  const { times, name, from, to } = targets();
  console.log(
    stills
      ? `${times.length} cuadros sueltos: ${times.join(", ")} s`
      : `De ${from} a ${to} s a ${fps} fps${samples > 1 ? ` con ${samples} subcuadros` : ""}: ${times.length} cuadros.`,
  );
  const { url, stop } = await server();
  const cleanup = async () => {
    await stop();
    process.exit(130);
  };
  process.on("SIGINT", cleanup);
  try {
    const frames = args.carpeta ? join(OUT, args.carpeta) : stills ? join(OUT, "wip") : join(OUT, "frames");
    if (stills) mkdirSync(frames, { recursive: true });
    const first = await (stills && !args.carpeta ? passStills(url, times, frames) : pass(url, times, frames));
    if (args.verificar) {
      const again = join(OUT, "frames-verificacion");
      const given = Bun.argv.slice(2);
      const rest = given.filter((arg, index) => arg !== "--verificar" && !arg.startsWith("--url") && given[index - 1] !== "--url");
      const child = Bun.spawn(["bun", import.meta.path, ...rest, "--url", url, "--carpeta", "frames-verificacion", "--sin-video"], {
        stdout: "inherit",
        stderr: "inherit",
      });
      if ((await child.exited) !== 0) throw new Error("la segunda pasada falló");
      const second = readdirSync(again)
        .filter((file) => file.endsWith(".png"))
        .sort()
        .map((file) => join(again, file));
      const differ = first.filter((file, index) => !second[index] || hash(file) !== hash(second[index]!));
      console.log(
        differ.length === 0
          ? `Verificado: los ${first.length} cuadros salieron idénticos las dos veces.`
          : `${differ.length} de ${first.length} cuadros salieron distintos, el primero ${relative(ROOT, differ[0]!)}.`,
      );
    }
    if (name && !args["sin-video"]) {
      const out = join(OUT, `${name}.mp4`);
      const blur = samples > 1 ? `tmix=frames=${samples},select='eq(mod(n\\,${samples})\\,${samples - 1})',setpts=N/(${fps}*TB),` : "";
      await ffmpeg([
        ...["-framerate", String(fps * samples), "-i", join(frames, "%06d.png")],
        ...["-vf", `${blur}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`, "-r", String(fps)],
        ...["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p"],
        ...["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", out],
      ]);
      console.log(`→ ${relative(ROOT, out)}`);
    }
  } finally {
    process.off("SIGINT", cleanup);
    await stop();
  }
}

/** Los cuadros sueltos no borran los que ya había en wip/. */
async function passStills(url: string, times: number[], into: string): Promise<string[]> {
  const start = prerollFor(times[0]!);
  const player = await open(url, start);
  const written: string[] = [];
  try {
    let at = start;
    const dt = 1 / fps;
    for (const t of times) {
      if (t - at > dt * 1.5) await roll(player, at, t);
      const png = await player.frame(t, dt, true);
      at = t + dt;
      const file = join(into, `t-${t.toFixed(2).padStart(6, "0")}.png`);
      await Bun.write(file, png!);
      written.push(file);
      console.log(`→ ${relative(ROOT, file)}`);
    }
  } finally {
    await player.close();
  }
  return written;
}

await main();
