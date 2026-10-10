"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type MotionValue } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { useLocalTime } from "./clock";

/*
 * The camera of the video. Everything is drawn once, in one world, and the
 * camera moves over it: its shot is the middle of what it looks at and how
 * wide that is, in units of the world, and it goes from one shot to the
 * next slowly, on the one curve. It is the `viewBox` of the drawing.
 *
 * What is written on the drawing keeps its size on screen whatever the
 * camera does: it goes in a `Pin`, which puts it at a point of the world
 * and scales it back by as much as the camera has zoomed, so that inside a
 * pin a unit is a pixel of the frame.
 */

/** The frame of the video: full HD, scaled to fit whatever window shows it. */
export const FRAME = { width: 1920, height: 1080 };

export interface Point {
  x: number;
  y: number;
}

/** What the camera looks at: the middle of it, and how wide it is, in units of the world. */
export interface Shot extends Point {
  width: number;
}

/** Where the camera is at this moment, for what has to follow it. */
interface Lens {
  x: MotionValue<number>;
  y: MotionValue<number>;
  width: MotionValue<number>;
}
const LENS = createContext<Lens | null>(null);

/**
 * Once the camera gets to a shot it holds it. What is written cannot be
 * moved a fraction of a pixel a frame: its letters are set on whole pixels,
 * so a slow drift makes them tremble. What keeps the frame from being a
 * slide is behind the drawing: what is far away (`Far`) never stops
 * breathing, slowly, by this much and once every this many seconds.
 */
const BREATH = { by: 0.045, seconds: 44, sway: 36 };

const viewBox = (x: number, y: number, width: number) => {
  const height = (width * FRAME.height) / FRAME.width;
  return `${x - width / 2} ${y - height / 2} ${width} ${height}`;
};

interface CameraProps {
  shot: Shot;
  /** Seconds to get there. Zero is a cut. */
  duration: number;
  label: string;
  children: ReactNode;
}

/** The drawing, seen through the camera, filling the frame. */
export function Camera({ shot, duration, label, children }: CameraProps) {
  const x = useMotionValue(shot.x);
  const y = useMotionValue(shot.y);
  const width = useMotionValue(shot.width);
  const still = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  // React writes the box once; from then on the camera does, so that a new shot does not jump there.
  const [first] = useState(() => viewBox(shot.x, shot.y, shot.width));

  useEffect(() => {
    if (still || duration === 0) {
      x.set(shot.x);
      y.set(shot.y);
      width.set(shot.width);
      return;
    }
    const moves = [
      animate(x, shot.x, { duration, ease: EASE }),
      animate(y, shot.y, { duration, ease: EASE }),
      animate(width, shot.width, { duration, ease: EASE }),
    ];
    return () => moves.forEach((move) => move.stop());
  }, [x, y, width, shot.x, shot.y, shot.width, duration, still]);

  const [lens] = useState(() => ({ x, y, width }));

  const frame = () => svg.current?.setAttribute("viewBox", viewBox(x.get(), y.get(), width.get()));
  useMotionValueEvent(x, "change", frame);
  useMotionValueEvent(y, "change", frame);
  useMotionValueEvent(width, "change", frame);

  return (
    <LENS.Provider value={lens}>
      <svg ref={svg} viewBox={first} className="absolute inset-0 size-full select-none" role="img" aria-label={label}>
        {children}
      </svg>
    </LENS.Provider>
  );
}

/**
 * Puts what it holds at a point of the world, at the same size on screen
 * however near or far the camera is: inside, a unit is a pixel of the frame.
 */
export function Pin({ x, y, children }: Point & { children: ReactNode }) {
  const lens = useContext(LENS);
  if (!lens) throw new Error("Pin needs a Camera around it");
  const { width } = lens;
  const group = useRef<SVGGElement>(null);
  const transform = (current: number) => `translate(${x} ${y}) scale(${current / FRAME.width})`;
  useMotionValueEvent(width, "change", (current) => group.current?.setAttribute("transform", transform(current)));
  return (
    <g ref={group} transform={transform(width.get())}>
      {children}
    </g>
  );
}

/** The width of the shots the drawing is mostly seen at: there, what is far away is drawn at its own size. */
const NEAR = 1800;

/**
 * Something further away than the drawing: it goes by, and grows and
 * shrinks, by only `depth` of what the camera does (1 is the drawing
 * itself, 0 is stuck to the frame). Seen behind the drawing, the two moving
 * at different speeds is what gives the frame its depth.
 */
export function Far({ depth, children }: { depth: number; children: ReactNode }) {
  const lens = useContext(LENS);
  if (!lens) throw new Error("Far needs a Camera around it");
  const { x, y, width } = lens;
  const group = useRef<SVGGElement>(null);
  const local = useLocalTime();
  const place = () => {
    // Read off the clock, so that it is the same at any moment however the player got there. The further away, the more it breathes.
    const turn = ((local?.get() ?? 0) * 2 * Math.PI) / BREATH.seconds;
    const breath = 1 + BREATH.by * (1 - depth) * Math.sin(turn);
    const sway = BREATH.sway * (1 - depth) * Math.cos(turn * 0.7);
    const scale = (width.get() / NEAR) ** (1 - depth) * breath;
    return `translate(${x.get()} ${y.get()}) scale(${scale}) translate(${-x.get() * depth + sway} ${-y.get() * depth})`;
  };
  const follow = () => group.current?.setAttribute("transform", place());
  useMotionValueEvent(local ?? width, "change", follow);
  useMotionValueEvent(x, "change", follow);
  useMotionValueEvent(y, "change", follow);
  useMotionValueEvent(width, "change", follow);
  return (
    <g ref={group} transform={place()} pointerEvents="none">
      {children}
    </g>
  );
}
