import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENES } from "./scenes";
import { CUES, END, cueAt, runOf, timeOf } from "./timeline";

describe("the timeline of the pitch", () => {
  test("puts every step of every scene in the video", () => {
    for (const scene of SCENES) scene.steps.forEach((_, step) => expect(timeOf(scene.id, step), `${scene.id}.${step}`).toBeNumber());
    expect(CUES.length).toBe(SCENES.reduce((sum, scene) => sum + scene.steps.length, 0));
  });

  test("keeps its cues in order and inside the video", () => {
    CUES.forEach((cue, index) => {
      expect(cue.index).toBe(index);
      if (index > 0) expect(cue.t).toBeGreaterThan(CUES[index - 1]!.t);
    });
    expect(CUES[0]!.t).toBe(0);
    expect(END).toBeGreaterThan(CUES.at(-1)!.t);
  });

  test("shows the last step whose time has come", () => {
    const second = CUES[1]!;
    expect(cueAt(second.t)).toBe(second);
    expect(cueAt(second.t - 0.001)).toBe(CUES[0]!);
    expect(cueAt(-1)).toBe(CUES[0]!);
    expect(cueAt(END + 10)).toBe(CUES.at(-1)!);
  });

  test("finds the run of a scene a step belongs to", () => {
    const veinte = CUES.find((cue) => cue.scene === "veinte" && cue.step === 2)!;
    const run = runOf(veinte);
    expect(run.first.step).toBe(0);
    expect(run.last.scene).toBe("veinte");
    expect(CUES[run.last.index + 1]!.scene).not.toBe("veinte");
  });

  test("is the same as the timeline the voice was anchored to", () => {
    const source = readFileSync(join(import.meta.dir, "../../../../../pitch/voz/tiempos.json"), "utf8");
    const copy = readFileSync(join(import.meta.dir, "tiempos.json"), "utf8");
    expect(copy).toBe(source);
  });
});
