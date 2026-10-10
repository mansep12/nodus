import { SCENES, position, type SceneId } from "./scenes";
import TIMES from "./tiempos.json";

/*
 * When each step of the video happens, in seconds: the picture locked to the
 * voice. The times come from `tiempos.json`, a copy of `pitch/voz/tiempos.json`
 * that `pitch/voz/anclar.ts` writes from where the voice says each line
 * (`pitch/voz/anclas.json`); before there is a voice, from the times of the
 * script. A cue is a step at a time; the step on screen at any moment is the
 * last cue that has started. The cues follow the voice, not the list of
 * scenes: the cover is the first step of the closing, and the web comes
 * after the idea.
 */

/** Frames per second of the video, and of stepping frame by frame. */
export const FPS = 60;

export type Origin = "voz" | "fijo" | "estimado" | "interpolado";

export interface Cue {
  scene: SceneId;
  step: number;
  /** Seconds from the start of the video. */
  t: number;
  /** The step as one number, as the drawings read it (`position`). */
  g: number;
  /** Where it is among the cues. */
  index: number;
  /** Whether its time comes from the voice, is fixed, or is still a guess. */
  origin: Origin;
}

const known = (scene: string): scene is SceneId => SCENES.some((candidate) => candidate.id === scene);

export const CUES: Cue[] = TIMES.pasos
  .filter((cue) => known(cue.escena) && cue.paso >= 0 && cue.paso < SCENES.find((scene) => scene.id === cue.escena)!.steps.length)
  .map((cue) => ({ scene: cue.escena as SceneId, step: cue.paso, t: cue.t, origin: cue.origen as Origin }))
  .sort((a, b) => a.t - b.t)
  .map((cue, index) => ({ ...cue, g: position(cue.scene, cue.step), index }));

/** When the video ends. */
export const END = Math.max(TIMES.fin, CUES.at(-1)?.t ?? 0);

export const clampTime = (t: number) => Math.min(END, Math.max(0, t));

/** The cue on screen at `t`: the last one to have started (the first, before any has). */
export function cueAt(t: number): Cue {
  let found = CUES[0]!;
  for (const cue of CUES) {
    if (cue.t > t) break;
    found = cue;
  }
  return found;
}

/** When a step starts: its latest cue up to `before`, or its first if none has come yet. */
export function timeOf(scene: SceneId, step: number, before = Infinity): number | undefined {
  const all = CUES.filter((cue) => cue.scene === scene && cue.step === step);
  return (all.filter((cue) => cue.t <= before).at(-1) ?? all[0])?.t;
}

/** When the next cue after this one starts, or the end. */
export const nextTime = (cue: Cue) => CUES[cue.index + 1]?.t ?? END;

/** The run of cues of one scene a cue belongs to: from its first to where the next scene starts. */
export function runOf(cue: Cue): { first: Cue; last: Cue; start: number; end: number } {
  let [first, last] = [cue.index, cue.index];
  while (first > 0 && CUES[first - 1]!.scene === cue.scene) first--;
  while (last < CUES.length - 1 && CUES[last + 1]!.scene === cue.scene) last++;
  return { first: CUES[first]!, last: CUES[last]!, start: CUES[first]!.t, end: nextTime(CUES[last]!) };
}

/** The first cue of every run of a scene, in order. */
export const RUNS: Cue[] = CUES.filter((cue, index) => index === 0 || CUES[index - 1]!.scene !== cue.scene);

/** A time as the HUD writes it: minutes, seconds and frames. */
export function clockText(t: number): string {
  const frames = Math.round(t * FPS);
  const seconds = Math.floor(frames / FPS);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${String(frames % FPS).padStart(2, "0")}`;
}
