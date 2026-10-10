"use client";

import { useMotionValueEvent, type MotionValue } from "motion/react";
import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { UNTYING } from "@/lib/motion";
import type { Untying } from "../circle-graph";

/*
 * The clock of the video, for the few drawings that are a matter of time
 * rather than of which step it is: the signatures of the twenty arriving one
 * after another, and a circle being untied. Read off the clock, they are
 * where they should be at any moment, however the player got there.
 */

export interface PitchClock {
  /** The timeline: seconds from the start of the video. It stops when the player is paused. */
  time: MotionValue<number>;
  /**
   * The time the drawings run on: the timeline while it plays. Paused, it
   * keeps running from wherever the timeline was put last, so that what a
   * step sets going plays out when the steps are taken by hand.
   */
  local: MotionValue<number>;
}

const CLOCK = createContext<PitchClock | null>(null);

export const ClockProvider = CLOCK.Provider;

/** The local time itself, for what moves with it on every frame; nothing, outside the Stage. */
export function useLocalTime(): MotionValue<number> | null {
  return useContext(CLOCK)?.local ?? null;
}

/**
 * Something read off the local time, such as how many have signed: the
 * component draws again only when what it reads changes, not on every frame.
 */
export function useLocal<T>(read: (local: number) => T): T {
  const clock = useContext(CLOCK);
  if (!clock) throw new Error("useLocal needs the clock of the Stage");
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const value = read(clock.local.get());
  const latest = useRef({ read, value });
  useEffect(() => {
    latest.current = { read, value };
  });
  useMotionValueEvent(clock.local, "change", (local) => {
    if (!Object.is(latest.current.read(local), latest.current.value)) redraw();
  });
  return value;
}

/** Where a circle is in being untied, `since` seconds after it was settled: pulled tight, letting go, or at rest. */
export function untyingAt(since: number | undefined): Untying {
  if (since === undefined || since < 0) return null;
  if (since < UNTYING.tight) return "tight";
  return since < UNTYING.tight + UNTYING.loose ? "loose" : null;
}
