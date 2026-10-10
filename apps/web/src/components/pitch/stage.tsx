"use client";

import { MotionConfig, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { FRAME } from "./camera";
import { ClockProvider } from "./clock";
import { SCENES } from "./scenes";
import { CUES, END, FPS, RUNS, clampTime, clockText, cueAt, runOf, timeOf, type Cue } from "./timeline";
import { World } from "./world";

/** How far ahead of the voice the camera sets off, in seconds, so that the shot is arriving when the line is said. */
const LEAD = 0.3;

/** Where the player opens: `?t=35` at 35 s; `#3.2` at the third step of the fourth scene; or the start. */
function opening(): { t: number; render: boolean; partB: boolean } {
  if (typeof window === "undefined") return { t: 0, render: false, partB: false };
  const params = new URLSearchParams(window.location.search);
  const render = params.has("render");
  const partB = params.get("parte") === "B";
  const t = Number(params.get("t"));
  if (params.has("t") && Number.isFinite(t)) return { t: clampTime(t), render, partB };
  if (partB) return { t: timeOf("veinte", 0) ?? 0, render, partB };
  const match = /^#(\d+)(?:\.(\d+))?$/.exec(window.location.hash);
  const scene = SCENES[Number(match?.[1] ?? -1)];
  const at = scene && timeOf(scene.id, Math.min(scene.steps.length - 1, Number(match?.[2] ?? 0)));
  return { t: at ?? 0, render, partB };
}

/** What the renderer (`pitch/render.ts`) drives the player with. */
export interface PitchHandle {
  ready: boolean;
  fps: number;
  end: number;
  cues: Cue[];
  /** Puts the timeline at `t` as if it had played there: what the renderer calls before each frame. */
  tick: (t: number) => void;
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  time: () => number;
}

declare global {
  interface Window {
    __pitch?: PitchHandle;
  }
}

/**
 * The pitch, locked to the voice. A clock runs the timeline of
 * `timeline.ts`, and the step on screen is the last whose time has come.
 * Space plays and pauses, with the voice if `public/pitch/voz.mp3` is there;
 * paused, the arrows still take one step at a time, as when it was played by
 * hand, and put the clock at that step, so that both agree. With `?render=1`
 * nothing moves on its own: `pitch/render.ts` puts the clock at every frame.
 */
export function Stage() {
  // Nothing is drawn until the page is in the browser, where the address says where to open.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [{ t: start, render, partB }] = useState(opening);
  const voiceOffset = partB ? (timeOf("veinte", 0) ?? 0) : 0;
  const voiceUrl = partB ? "/pitch/B.mp3" : "/pitch/voz.mp3";
  const time = useMotionValue(start);
  const local = useMotionValue(start);
  const [cue, setCue] = useState(() => cueAt(start));
  const [ahead, setAhead] = useState(() => cueAt(start + LEAD));
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState(!render);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [voice, setVoice] = useState(false);
  // A render draws nothing until the renderer puts the clock for the first time, so that all of it runs on the renderer's time.
  const [rolling, setRolling] = useState(!render);
  const [scale, setScale] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  // The local time runs from here: the timeline's time `t` at the page's `now`.
  const anchor = useRef({ t: start, now: 0 });
  const clock = useRef({ time, local });

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / FRAME.width, window.innerHeight / FRAME.height));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // The voice plays along if it has been put where the page can fetch it.
  useEffect(() => {
    if (render) return;
    let live = true;
    fetch(voiceUrl, { method: "HEAD" })
      .then((response) => live && setVoice(response.ok))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [render, voiceUrl]);

  useEffect(() => {
    if (ready && !render)
      window.history.replaceState(null, "", `${window.location.search}#${SCENES.findIndex((scene) => scene.id === cue.scene)}.${cue.step}`);
  }, [cue, ready, render]);

  /** The timeline at `t`; a jump also puts the local time and the voice there, a flow only moves on. */
  const put = (t: number, jump: boolean) => {
    const at = clampTime(t);
    time.set(at);
    if (jump) {
      anchor.current = { t: at, now: performance.now() };
      local.set(at);
      if (audio.current && voice) audio.current.currentTime = Math.max(0, at - voiceOffset);
    }
    setCue(cueAt(at));
    setAhead(cueAt(at + LEAD));
  };

  const play = () => {
    const from = time.get() >= END ? voiceOffset : Math.max(voiceOffset, time.get());
    put(from, true);
    setPlaying(true);
    if (audio.current && voice) {
      audio.current.currentTime = from - voiceOffset;
      audio.current.play().catch(() => {});
    }
  };
  const pause = () => {
    setPlaying(false);
    audio.current?.pause();
    anchor.current = { t: time.get(), now: performance.now() };
  };

  // Every frame: the local time runs on, and the timeline with it while it plays.
  const frame = useEffectEvent((now: number) => {
    const running = anchor.current.t + (now - anchor.current.now) / 1000;
    if (!playing) {
      local.set(running);
      return;
    }
    if (loop && running >= loop.end) return put(loop.start, true);
    if (running >= END) {
      put(END, false);
      local.set(END);
      return pause();
    }
    local.set(running);
    put(running, false);
    // The clock leads; the voice is pulled back to it if it drifts.
    const voiceAt = audio.current ? audio.current.currentTime + voiceOffset : undefined;
    if (voice && voiceAt !== undefined && !audio.current!.paused && Math.abs(voiceAt - running) > 0.12)
      audio.current!.currentTime = Math.max(0, running - voiceOffset);
  });
  useEffect(() => {
    if (render) return;
    anchor.current.now = performance.now();
    let request = requestAnimationFrame(function loop(now) {
      frame(now);
      request = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(request);
  }, [render]);

  const step = (by: number) => {
    const current = cueAt(time.get());
    // Back from the middle of a step goes to its start; from its start, to the one before.
    const target = by < 0 && time.get() - current.t > 0.5 ? current : CUES[Math.max(0, Math.min(CUES.length - 1, current.index + by))]!;
    put(target.t, true);
  };
  const scene = (by: number) => {
    const current = runOf(cueAt(time.get())).first;
    const index = RUNS.indexOf(current) + by;
    put((by < 0 && time.get() - current.t > 0.5 ? current : (RUNS[Math.max(0, Math.min(RUNS.length - 1, index))] ?? current)).t, true);
  };
  const seekBy = (seconds: number) => put(time.get() + seconds, true);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const keys: Record<string, () => void> = {
      " ": () => (playing ? pause() : play()),
      ArrowRight: () => (event.shiftKey ? seekBy(5) : playing ? seekBy(1) : step(1)),
      ArrowLeft: () => (event.shiftKey ? seekBy(-5) : playing ? seekBy(-1) : step(-1)),
      Enter: () => step(1),
      "]": () => step(1),
      "[": () => step(-1),
      ".": () => {
        pause();
        seekBy(1 / FPS);
      },
      ",": () => {
        pause();
        seekBy(-1 / FPS);
      },
      PageDown: () => scene(1),
      PageUp: () => scene(-1),
      Home: () => put(voiceOffset, true),
      r: () => put(runOf(cueAt(time.get())).start, true),
      l: () => setLoop((current) => (current ? null : runOf(cueAt(time.get())))),
      h: () => setHud((shown) => !shown),
    };
    const action = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
  useEffect(() => {
    if (render) return;
    const listen = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [render]);

  // The renderer's handle. The clock is put synchronously, so the frame captured next already shows it.
  const control = useEffectEvent((action: "tick" | "seek" | "play" | "pause", t = 0) => {
    if (action === "tick") {
      flushSync(() => {
        setRolling(true);
        anchor.current = { t, now: performance.now() };
        local.set(t);
        put(t, false);
      });
      // The blooms drift on the CSS clock; in a render they drift on the video's, so that a frame is always the same.
      for (const animation of document.getAnimations())
        if (animation instanceof CSSAnimation && animation.animationName === "drift") {
          animation.pause();
          animation.currentTime = t * 1000;
        }
    } else flushSync(() => (action === "seek" ? put(t, true) : action === "play" ? play() : pause()));
  });
  useEffect(() => {
    if (!ready) return;
    const pitch: PitchHandle = {
      ready: false,
      fps: FPS,
      end: END,
      cues: CUES,
      tick: (t) => control("tick", t),
      seek: (t) => control("seek", t),
      play: () => control("play"),
      pause: () => control("pause"),
      time: () => time.get(),
    };
    window.__pitch = pitch;
    document.fonts.ready.then(() => (pitch.ready = true));
    return () => {
      delete window.__pitch;
    };
  }, [ready, time]);

  const meta = SCENES.find((candidate) => candidate.id === cue.scene)!;
  const sceneNumber = SCENES.indexOf(meta) + 1;
  const clockLabel = useTransform(time, clockText);
  const progress = useTransform(time, (t) => `${(t / END) * 100}%`);
  const ending = useTransform(time, [END - 0.8, END - 0.1], [0, 1]);

  return (
    <MotionConfig reducedMotion="never">
      <div className="fixed inset-0 overflow-hidden bg-ink">
        {/* Centred by hand: a grid would size its track to the frame and centre it in that. */}
        <div
          className="absolute left-1/2 top-1/2 isolate overflow-hidden bg-canvas text-ink"
          style={{ width: FRAME.width, height: FRAME.height, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {ready && rolling && (
            <ClockProvider value={clock.current}>
              <World g={cue.g} camera={ahead.g} />
              <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: ending }} />

              {hud && (
                <div className="absolute inset-x-0 bottom-0 bg-canvas/85 px-8 pb-5 pt-3 text-body-sm text-muted">
                  <Scrubber progress={progress} onSeek={(t) => put(t, true)} />
                  <div className="mt-3 flex items-end justify-between gap-8">
                    <p className="max-w-5xl">
                      <motion.span className="font-mono tabular-nums text-ink">{clockLabel}</motion.span>
                      <span className="ml-2">{playing ? "▶" : "❚❚"}</span>
                      {loop && <span className="ml-2 text-free-deep">bucle</span>}
                      <span className="mx-2">·</span>
                      <span className="font-medium text-ink">
                        {sceneNumber}. {meta.title}
                      </span>
                      <span className="mx-2">·</span>
                      <span>
                        paso {cue.step + 1}/{meta.steps.length}
                        {cue.origin === "estimado" || cue.origin === "interpolado" ? ` (${cue.origin})` : ""}
                      </span>
                      <span className="mx-2">·</span>
                      <span className="italic">{meta.steps[cue.step]}</span>
                    </p>
                    <p className="shrink-0 text-right text-caption">
                      espacio {playing ? "pausa" : "reproduce"}
                      {voice ? " con la voz" : ""} · {playing ? "← → 1 s" : "← → paso"} · ⇧ 5 s · [ ] paso · , . cuadro · PgUp PgDn escena ·
                      R escena · L bucle · H oculta
                    </p>
                  </div>
                </div>
              )}
            </ClockProvider>
          )}
        </div>
      </div>
      {voice && <audio ref={audio} src={voiceUrl} preload="auto" />}
    </MotionConfig>
  );
}

/** The whole video as a line, with a tick at every step; a click puts the clock there. */
function Scrubber({ progress, onSeek }: { progress: MotionValue<string>; onSeek: (t: number) => void }) {
  return (
    <div
      className="relative h-3 cursor-pointer"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - box.left) / box.width) * END);
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-hairline-strong" />
      {CUES.map((cue) => (
        <div
          key={cue.index}
          className={`absolute top-0 h-3 w-px ${cue.step === 0 ? "bg-ink" : "bg-muted-soft"}`}
          style={{ left: `${(cue.t / END) * 100}%` }}
        />
      ))}
      <motion.div className="absolute top-0 h-3 w-0.5 bg-debt" style={{ left: progress }} />
    </div>
  );
}
