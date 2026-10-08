"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";
import { EASE } from "@/lib/motion";
import { INK, type Tone } from "@/lib/tones";
import { Avatar } from "./ui";

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
  // `MotionConfig` does not reach what is animated by hand, so this asks for itself.
  const still = useReducedMotion();
  useEffect(() => {
    const running = animate(progress, drawn ? 1 : 0, {
      duration: still ? 0 : duration,
      delay: drawn && !still ? delay : 0,
      ease: EASE,
    });
    return () => running.stop();
  }, [progress, drawn, delay, duration, still]);

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

interface ArrowheadProps {
  tone: Tone;
  /** Half its width: wider than its cord, so that it reads as an arrowhead and not as the cord's end. */
  half: number;
  /** How much of its cord is drawn. It appears as the cord gets to it. */
  progress: MotionValue<number>;
}

/** The head of a cord, which says which way the money is owed. It points right from where it is put. */
export function Arrowhead({ tone, half, progress }: ArrowheadProps) {
  const arrival = useTransform(progress, [0.7, 1], [0, 1]);
  return (
    <motion.path
      d={`M ${-half * 0.8} ${-half} L ${half} 0 L ${-half * 0.8} ${half} z`}
      strokeWidth={1.5}
      strokeLinejoin="round"
      className={`${INK[tone].fill} ${INK[tone].stroke}`}
      style={{ opacity: arrival, scale: arrival }}
    />
  );
}

/** The cord between the two businesses of a debt, from the edge of one to the arrowhead at the other. */
const SPAN = { width: 72, height: 24, from: 4, to: 56, head: 61 };

interface DebtCordProps {
  /** The business that owes, which is the one looking. */
  debtor: string;
  creditor: string;
  accepted: boolean;
}

/**
 * A debt of the business looking, drawn as the graphs draw it: dotted while
 * it is not accepted, and once it is, a cord that says which way the money
 * is owed.
 */
export function DebtCord({ debtor, creditor, accepted }: DebtCordProps) {
  const draw = useDraw(SPAN.to - SPAN.from, accepted);
  const waiting = useTransform(draw.progress, [0, 1], [0.85, 0]);
  const middle = SPAN.height / 2;
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-1">
      <Avatar name={debtor} tone="ink" />
      <svg viewBox={`0 0 ${SPAN.width} ${SPAN.height}`} className="h-6 w-[72px]" fill="none">
        <motion.line
          x1={SPAN.from}
          y1={middle}
          x2={SPAN.width - SPAN.from}
          y2={middle}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="0.1 8"
          className={INK.debt.stroke}
          style={{ opacity: waiting }}
        />
        <motion.path
          d={`M ${SPAN.from} ${middle} L ${SPAN.to} ${middle}`}
          strokeWidth={3.5}
          strokeLinecap="round"
          className={INK.debt.stroke}
          style={draw.style}
        />
        <g transform={`translate(${SPAN.head} ${middle})`}>
          <Arrowhead tone="debt" half={5} progress={draw.progress} />
        </g>
      </svg>
      <Avatar name={creditor} tone="debt" />
    </span>
  );
}
