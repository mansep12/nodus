/**
 * Graba la demo sola: un Chromium sin ventana recorre la app de punta a punta
 * (entrar, anotar la deuda, el transportista acepta, el círculo, la firma, el
 * comprobante) con un puntero dibujado que se mueve como una mano, y guarda
 * cada cuadro que el navegador dibuja con su hora, más la hora de cada cosa
 * que pasa (`marcas.json`), para que el montaje corte cada toma a su frase.
 *
 *   bun pitch/grabar.ts                       # contra http://localhost:3004, a pitch/out/demo/toma
 *   bun pitch/grabar.ts --ensayo              # solo entra y mira la red: no firma nada
 *   bun pitch/grabar.ts --salida pitch/out/demo/toma-2 --url http://localhost:3004
 *
 * La app es la copia de `DEMO_PUERTO=3004 DEMO_DATOS=.data-auto bash pitch/demo.sh vecinos` (con `CREAR=1`
 * y `MANOS_FUERA=1`): ahí la panadería y el transportista son cuentas que hicieron los scripts, y sus llaves
 * de prueba (pitch/out/demo/vecinos.json) se le entregan aquí al autenticador virtual del navegador. La app
 * pide la passkey con WebAuthn, como siempre; lo que no hay es un diálogo que aprobar.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Locator, type Page } from "playwright-core";
import { ffmpeg } from "./ffmpeg.ts";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1]!;
};
const URL_APP = option("url", "http://localhost:3004");
const OUT = resolve(option("salida", "pitch/out/demo/toma"));
const REHEARSAL = args.includes("--ensayo");
/** 1536×864 a 1,25: lo que se ve en una pantalla de 1920×1080 con el zoom del navegador en 125 %. */
const SCALE = Number(option("escala", "1.25"));
const VIEW = { width: Math.round(1920 / SCALE), height: Math.round(1080 / SCALE) };
const FPS = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Date.now() / 1000;

/* Las llaves de prueba de las cuentas que hicieron los scripts. */

interface Saved {
  name: string;
  address: string;
  passkey: { credentialId: string; privateKey: string };
}
const kept = JSON.parse(readFileSync(resolve("pitch/out/demo/vecinos.json"), "utf8"))[URL_APP] as
  { bakery?: Saved; carrier?: Saved } | undefined;
if (!kept?.bakery || !kept.carrier) {
  throw new Error(`No hay una panadería hecha por los scripts para ${URL_APP}: CREAR=1 bash pitch/demo.sh vecinos (con DEMO_PUERTO).`);
}

function chromiumPath(): string {
  if (process.env.PITCH_CHROMIUM) return process.env.PITCH_CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright");
  const builds = readdirSync(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    const path = join(cache, build, "chrome-linux64/chrome");
    if (existsSync(path)) return path;
  }
  throw new Error("No encuentro Chromium: bunx playwright-core install chromium, o PITCH_CHROMIUM=/ruta.");
}

/* El puntero: la captura no trae el del sistema, así que se dibuja uno en la página y sigue al ratón. */

const POINTER = `
(() => {
  const place = () => {
    if (document.getElementById("__puntero")) return;
    const el = document.createElement("div");
    el.id = "__puntero";
    el.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:30px;will-change:transform;transition:opacity .2s;opacity:0;";
    el.innerHTML = '<svg viewBox="0 0 22 30" width="22" height="30" style="display:block;overflow:visible;transform-origin:2px 2px;transition:transform .09s ease-out;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))"><path d="M2 2 L2 23.5 L7.4 18.6 L11 27 L14.4 25.5 L10.8 17.2 L18 17.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(el);
    const move = (x, y) => {
      el.style.transform = "translate(" + (x - 2) + "px," + (y - 2) + "px)";
      el.style.opacity = "1";
      try { sessionStorage.setItem("__puntero", x + "," + y); } catch {}
    };
    try {
      const last = sessionStorage.getItem("__puntero");
      if (last) { const [x, y] = last.split(",").map(Number); move(x, y); }
    } catch {}
    addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
    addEventListener("mousedown", () => { el.firstChild.style.transform = "scale(.86)"; }, true);
    addEventListener("mouseup", () => { el.firstChild.style.transform = ""; }, true);
  };
  if (document.documentElement) place();
  document.addEventListener("DOMContentLoaded", place);
})();
`;

/** Una pestaña que se graba: su página, su ratón y los cuadros que va dibujando. */
class Camera {
  private at = { x: VIEW.width - 40, y: VIEW.height * 0.45 };
  private frames: Array<{ file: string; t: number }> = [];
  private last: Buffer | null = null;
  private recording = false;
  private stopped?: { start: number; frames: number; seconds: number };

  private constructor(
    readonly name: string,
    readonly page: Page,
    private readonly cdp: CDPSession,
    private readonly dir: string,
  ) {}

  /** Abre una pestaña con la passkey de `who` en un autenticador virtual. */
  static async open(browser: Browser, name: string, who: Saved): Promise<Camera> {
    // Sin ventana emulada: la escala es la del navegador entero, y así los cuadros salen en píxeles de pantalla (1920×1080).
    const context = await browser.newContext({
      viewport: null,
      locale: "es-CL",
      timezoneId: "America/Santiago",
      colorScheme: "light",
    });
    await context.addInitScript(POINTER);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    // La ventana trae su barra: se agranda hasta que la página mida justo lo que se graba.
    for (let tries = 0; tries < 4; tries++) {
      const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
      if (width === VIEW.width && height === VIEW.height) break;
      const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { width: bounds.width! + VIEW.width - width, height: bounds.height! + VIEW.height - height },
      });
      await sleep(300);
    }
    const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
    if (width !== VIEW.width || height !== VIEW.height)
      throw new Error(`La página mide ${width}×${height}, no ${VIEW.width}×${VIEW.height}.`);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await cdp.send("WebAuthn.addCredential", {
      authenticatorId,
      credential: {
        credentialId: Buffer.from(who.passkey.credentialId, "base64url").toString("base64"),
        isResidentCredential: true,
        rpId: new URL(URL_APP).hostname,
        privateKey: who.passkey.privateKey,
        userHandle: Buffer.from(who.address).toString("base64"),
        signCount: 0,
      },
    });
    const dir = join(OUT, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const camera = new Camera(name, page, cdp, dir);
    cdp.on("Page.screencastFrame", (frame) => {
      void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      if (!camera.recording) return;
      camera.keep(Buffer.from(frame.data, "base64"), frame.metadata.timestamp ?? now());
    });
    return camera;
  }

  private keep(image: Buffer, t: number) {
    const file = `c-${String(this.frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(join(this.dir, file), image);
    // La hora de cada cuadro queda escrita al llegar: si la toma se cae a medias, los cuadros siguen sirviendo.
    appendFileSync(join(this.dir, "cuadros.jsonl"), `${JSON.stringify({ file, t })}\n`);
    this.frames.push({ file, t });
    this.last = image;
  }

  async start() {
    this.recording = true;
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 96, everyNthFrame: 1 });
  }

  /** Detiene la captura y escribe la lista de cuadros con su duración, para ffmpeg. Devuelve cuándo empezó y cuántos cuadros hubo. */
  async stop(): Promise<{ start: number; frames: number; seconds: number }> {
    if (!this.recording) return this.stopped!;
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    this.recording = false;
    // El último cuadro se queda hasta ahora: sin esto el video terminaría en el último cambio de la pantalla.
    if (this.last) this.keep(this.last, now());
    const start = this.frames[0]?.t ?? now();
    const lines = ["ffconcat version 1.0"];
    for (const [index, frame] of this.frames.entries()) {
      const next = this.frames[index + 1];
      lines.push(`file '${frame.file}'`);
      if (next) lines.push(`duration ${Math.max(next.t - frame.t, 1 / 240).toFixed(5)}`);
    }
    // El demuxer necesita el último archivo dos veces para respetar la última duración.
    if (this.frames.length > 0) lines.push(`file '${this.frames.at(-1)!.file}'`);
    writeFileSync(join(this.dir, "cuadros.txt"), lines.join("\n"));
    this.stopped = { start, frames: this.frames.length, seconds: (this.frames.at(-1)?.t ?? start) - start };
    return this.stopped;
  }

  /** Los cuadros, a un video de cadencia fija. */
  async encode() {
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", join(this.dir, "cuadros.txt"),
      "-vf", `fps=${FPS},format=yuv420p`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-movflags", "+faststart",
      join(OUT, `${this.name}.mp4`),
    ]); // prettier-ignore
  }

  /* El ratón. */

  /** Lleva el puntero hasta un punto, acelerando y frenando, por una curva apenas arqueada. */
  async glide(x: number, y: number, ms?: number) {
    const from = { ...this.at };
    const distance = Math.hypot(x - from.x, y - from.y);
    const duration = ms ?? Math.min(1_100, 320 + distance * 0.75);
    const bow = Math.min(40, distance * 0.08);
    const [nx, ny] = distance === 0 ? [0, 0] : [-(y - from.y) / distance, (x - from.x) / distance];
    const began = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - began) / duration);
      const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const arc = Math.sin(Math.PI * eased) * bow;
      await this.page.mouse.move(from.x + (x - from.x) * eased + nx * arc, from.y + (y - from.y) * eased + ny * arc);
      if (k === 1) break;
      await sleep(1000 / FPS);
    }
    this.at = { x, y };
  }

  /** Dónde queda, en la ventana, un punto de un elemento (por defecto su centro). */
  private async point(target: Locator, at: { x?: number; y?: number } = {}) {
    await target.waitFor({ state: "visible", timeout: 60_000 });
    const box = (await target.boundingBox())!;
    return { x: box.x + box.width * (at.x ?? 0.5), y: box.y + box.height * (at.y ?? 0.5) };
  }

  async hover(target: Locator, at?: { x?: number; y?: number }, ms?: number) {
    const point = await this.point(target, at);
    await this.glide(point.x, point.y, ms);
  }

  /** Va hasta el elemento, se queda quieto un momento y hace clic. */
  async click(target: Locator, rest = 350) {
    await this.hover(target);
    await sleep(rest);
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
  }

  async type(text: string, each = 120) {
    await this.page.keyboard.type(text, { delay: each });
  }

  /** Baja o sube la página de a poco, como con la rueda. */
  async scroll(pixels: number, ms = 700) {
    const steps = Math.max(1, Math.round((ms / 1000) * FPS));
    for (let step = 0; step < steps; step++) {
      await this.page.mouse.wheel(0, pixels / steps);
      await sleep(1000 / FPS);
    }
  }

  text(text: string | RegExp, exact = false) {
    return this.page.getByText(text, { exact }).first();
  }

  button(name: string | RegExp) {
    return this.page.getByRole("button", { name }).first();
  }

  async shot(name: string) {
    await this.page.screenshot({ path: join(OUT, `${name}.png`) });
  }
}

/* Las marcas: la hora de cada cosa, en el mismo reloj que los cuadros. */

const marks: Array<{ name: string; camera: string; t: number }> = [];
function mark(camera: Camera, name: string) {
  marks.push({ name, camera: camera.name, t: now() });
  console.log(`  ${((now() - began) | 0).toString().padStart(4)} s  ${camera.name}: ${name}`);
}
const began = now();

/** El clic de una toma: va, se queda quieto un momento, marca la hora y aprieta. */
async function press(camera: Camera, target: Locator, name: string, glide = 520, rest = 300) {
  await camera.hover(target, undefined, glide);
  await sleep(rest);
  mark(camera, name);
  await camera.page.mouse.down();
  await sleep(90);
  await camera.page.mouse.up();
}

/** Entra con la passkey desde la portada. */
async function enter(camera: Camera, recordIt: boolean) {
  await camera.page.goto(URL_APP, { waitUntil: "networkidle" });
  const button = camera.button("Entrar con mi passkey");
  await button.waitFor({ state: "visible", timeout: 30_000 });
  if (recordIt) {
    await camera.glide(VIEW.width * 0.62, VIEW.height * 0.3, 10);
    await camera.start();
    mark(camera, "portada");
    // La portada se queda mientras la voz presenta la demo.
    await sleep(5_200);
    await press(camera, button, "entrar", 900, 450);
  } else {
    await button.click();
  }
  await camera.text("Lo que te deben").waitFor({ state: "visible", timeout: 60_000 });
  if (recordIt) mark(camera, "red");
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  headless: true,
  args: [`--force-device-scale-factor=${SCALE}`, `--window-size=${VIEW.width},${VIEW.height + 90}`, "--force-color-profile=srgb"],
});
const bakery = await Camera.open(browser, "panaderia", kept.bakery);
const carrier = await Camera.open(browser, "transportista", kept.carrier);

// Entre una acción y la siguiente el puntero se queda quieto: en esas pausas corta o alarga el montaje, sin que se note.
try {
  // El transportista entra fuera de cámara y espera en su red.
  if (!REHEARSAL) await enter(carrier, false);

  // Toma 1: la portada, entrar, la red llena.
  await enter(bakery, true);
  await sleep(1_300);
  // Las dos estrellas enteras a la vista.
  await bakery.scroll(130, 600);
  await sleep(100);
  const leaf = (name: string) => bakery.page.locator("svg").getByText(name, { exact: true }).first();
  await bakery.hover(leaf("HA"), { x: 0.75, y: 0.7 }, 700);
  mark(bakery, "mira-cliente");
  await sleep(2_400);
  await bakery.shot("1-red");

  if (!REHEARSAL) {
    // Toma 2: anotar lo que debe el transportista.
    mark(bakery, "registrar");
    await press(bakery, bakery.button("Registrar una deuda"), "registrar-abre", 520, 160);
    const who = bakery.page.getByRole("combobox").first();
    await who.waitFor({ state: "visible" });
    await sleep(300);
    await bakery.hover(who, { x: 0.3 }, 380);
    await bakery.page.mouse.down();
    await bakery.page.mouse.up();
    await sleep(150);
    await bakery.type("Flet", 110);
    const match = bakery.page.getByRole("option", { name: /Fletes Ruta 5/ }).first();
    await match.waitFor({ state: "visible", timeout: 30_000 });
    await sleep(200);
    await bakery.hover(match, { x: 0.3 }, 340);
    await sleep(160);
    await bakery.page.mouse.down();
    await bakery.page.mouse.up();
    mark(bakery, "elegido");
    const amount = bakery.page.getByPlaceholder("0", { exact: true });
    await bakery.hover(amount, { x: 0.3 }, 360);
    await bakery.page.mouse.down();
    await bakery.page.mouse.up();
    await sleep(120);
    await bakery.type("90", 170);
    await sleep(250);
    await press(bakery, bakery.button("Registrar con passkey"), "registrar-clic", 460, 300);
    await bakery.shot("2-formulario");
    await bakery.text("Deuda registrada").waitFor({ state: "visible", timeout: 90_000 });
    mark(bakery, "registrada");
    await bakery.glide(VIEW.width * 0.53, VIEW.height * 0.36, 600);
    await sleep(2_800);
    await bakery.shot("2-punteada");

    // Toma 3: el transportista la acepta desde su cuenta.
    await carrier.page
      .getByRole("link", { name: /Bandeja/ })
      .first()
      .click();
    await carrier.text("registró que le debes").waitFor({ state: "visible", timeout: 60_000 });
    await carrier.glide(VIEW.width * 0.62, VIEW.height * 0.24, 10);
    await sleep(900);
    await carrier.start();
    mark(carrier, "su-bandeja");
    await sleep(2_400);
    await carrier.shot("3-bandeja");
    await press(carrier, carrier.button("Aceptar con passkey"), "aceptar-clic", 650, 380);
    await carrier.text("Aceptada", true).waitFor({ state: "visible", timeout: 90_000 });
    mark(carrier, "aceptada");
    await sleep(3_000);
    await carrier.shot("3-aceptada");
    const carrierTake = await carrier.stop();

    // Toma 4: la panadería ve que se cerró un círculo y va a la bandeja.
    await bakery.text("Falta tu firma en un círculo").waitFor({ state: "visible", timeout: 90_000 });
    mark(bakery, "circulo");
    await sleep(2_600);
    await bakery.shot("4-aviso");
    mark(bakery, "ir-a-bandeja");
    await bakery.click(bakery.page.getByRole("link", { name: "Ir a la bandeja" }).first(), 300);
    await bakery.text("Círculo detectado").waitFor({ state: "visible", timeout: 60_000 });
    mark(bakery, "tarjeta");
    await sleep(500);
    // La tarjeta entera a la vista, con su botón.
    const sign = bakery.button("Firmar con passkey");
    const signBox = (await sign.boundingBox())!;
    const below = signBox.y + signBox.height + 90 - VIEW.height;
    if (below > 0) await bakery.scroll(below, 600);
    await sleep(2_200);
    await bakery.shot("4-tarjeta");
    for (const [index, label] of ["Dejas de deber", "Dejan de deberte", "Pagas"].entries()) {
      await bakery.hover(bakery.text(label, true), { x: 0.3, y: 2.6 }, 650);
      mark(bakery, `cifra-${index + 1}`);
      await sleep(1_500);
    }

    // Toma 5: su firma.
    await press(bakery, sign, "firmar-clic", 600, 450);
    await bakery.text(/Firmando · 1 de 3/).waitFor({ state: "visible", timeout: 90_000 });
    mark(bakery, "1-de-3");
    await sleep(900);
    await bakery.hover(bakery.text("Si falta una firma, no pasa nada"), { x: 0.82, y: 0.86 }, 800);
    mark(bakery, "si-falta");
    await bakery.shot("5-firmando");

    // Toma 6: firman los otros dos y se desanuda.
    await bakery.text(/Firmando · 2 de 3/).waitFor({ state: "visible", timeout: 120_000 });
    mark(bakery, "2-de-3");
    await Promise.race([
      bakery.text(/Firmando · 3 de 3/).waitFor({ state: "visible", timeout: 120_000 }),
      bakery.text("Liquidando").waitFor({ state: "visible", timeout: 120_000 }),
    ]);
    mark(bakery, "3-de-3");
    await bakery.text("Desanudado", true).waitFor({ state: "visible", timeout: 180_000 });
    mark(bakery, "desanudado");
    // El nudo se suelta y aparece el comprobante. Unos 4 s después de «Desanudado» la tarjeta se muda a «Recién
    // desanudados» y la página se reacomoda: el puntero va a «Pagaste» antes de eso, y al comprobante después.
    await sleep(1_900);
    await bakery.hover(bakery.text("Pagaste", true), { x: 0.3, y: 2.6 }, 800);
    mark(bakery, "pagaste");
    await bakery.shot("6-desanudado");
    await sleep(4_200);
    await bakery.hover(bakery.text("Ver la transacción en la red"), { x: 0.5, y: 0.6 }, 800);
    mark(bakery, "comprobante");
    await sleep(3_000);
    mark(bakery, "fin");

    const bakeryTake = await bakery.stop();
    writeFileSync(
      join(OUT, "marcas.json"),
      JSON.stringify({ url: URL_APP, takes: { panaderia: bakeryTake, transportista: carrierTake }, marks }, null, 2),
    );
    console.log(
      `panadería: ${bakeryTake.frames} cuadros en ${bakeryTake.seconds.toFixed(1)} s (${(bakeryTake.frames / bakeryTake.seconds).toFixed(1)} por segundo)`,
    );
    await carrier.encode();
  } else {
    const take = await bakery.stop();
    writeFileSync(join(OUT, "marcas.json"), JSON.stringify({ url: URL_APP, takes: { panaderia: take }, marks }, null, 2));
    console.log(`ensayo: ${take.frames} cuadros en ${take.seconds.toFixed(1)} s (${(take.frames / take.seconds).toFixed(1)} por segundo)`);
  }
  await bakery.encode();
} catch (error) {
  await bakery.shot("error-panaderia").catch(() => {});
  await carrier.shot("error-transportista").catch(() => {});
  // Lo grabado hasta aquí queda con sus marcas y sus cuadros.
  const takes = { panaderia: await bakery.stop(), transportista: await carrier.stop() };
  writeFileSync(join(OUT, "marcas.json"), JSON.stringify({ url: URL_APP, error: String(error), takes, marks }, null, 2));
  throw error;
} finally {
  await browser.close();
}
console.log(`Listo: ${OUT}`);
