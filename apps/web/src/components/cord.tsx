"use client";

import { animate, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

interface Options {
  /** Seconds before it starts to draw. Letting go never waits. */
  delay?: number;
  duration?: number;
}

/**
 * Draws a stroke of `length` from its start while `drawn`, and takes it back
 * when not. Returns the style that shows how much of it there is, and
 * `progress` for whatever has to keep pace with it.
 *
 * The stroke is cut with a dash of its real length and, once whole, with no
 * dash at all: browsers misdraw thick strokes whose dash ends exactly where
 * they do (as `pathLength` animations leave them) at some zoom levels.
 */
export function useDraw(length: number, drawn: boolean, { delay = 0, duration = 0.7 }: Options = {}) {
  const progress = useMotionValue(0);
  useEffect(() => {
    const running = animate(progress, drawn ? 1 : 0, { duration, delay: drawn ? delay : 0, ease: [0.2, 0.7, 0.2, 1] });
    return () => running.stop();
  }, [progress, drawn, delay, duration]);

  return {
    progress,
    style: {
      strokeDasharray: useTransform(progress, (done) => (done >= 1 ? "none" : `${length} ${length}`)),
      strokeDashoffset: useTransform(progress, (done) => length * (1 - done)),
      // A stroke with nothing drawn still shows its round cap.
      opacity: useTransform(progress, [0, 0.04, 1], [0, 1, 1]),
    },
  };
}
