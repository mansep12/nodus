"use client";

import { animate, motion, useMotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { INK, type Tone } from "@/lib/tones";
import { Arrowhead, useDraw } from "../cord";
import { Bloom } from "../ui";
import type { Point } from "./camera";
import { Glyph, type GlyphName } from "./glyphs";

/*
 * What the world of the pitch is drawn with, in the language of the graphs
 * of the app: a business is a ring (the three of the story with their
 * glyph inside), a debt is a cord with an arrowhead that says which way the
 * money is owed, a signature is a tick. And what is written on it: small
 * notes beside what they name, drawn out from it on a hairline. Nothing
 * here is a product component: the scenes show the idea, the app the app.
 */

/** A cord's ink: one of the three, or the ink itself when nobody in particular is looking. */
export type CordTone = Tone | "ink";

const STROKE: Record<CordTone, string> = {
  ink: "stroke-ink",
  credit: INK.credit.stroke,
  debt: INK.debt.stroke,
  free: INK.free.stroke,
  neutral: "stroke-hairline-strong",
};

/** The arrowhead takes a tone of the books; the ink and the grey borrow from them. */
const HEAD_TONE: Record<CordTone, Tone> = { ink: "neutral", credit: "credit", debt: "debt", free: "free", neutral: "neutral" };

/** The cord between two points as a straight line, stopping short of the rings at both ends. */
export function line(from: Point, to: Point, clearFrom: number, clearTo: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  const [ux, uy] = [dx / span, dy / span];
  const tail = { x: from.x + ux * clearFrom, y: from.y + uy * clearFrom };
  const headAt = { x: to.x - ux * clearTo, y: to.y - uy * clearTo };
  return {
    d: `M ${tail.x} ${tail.y} L ${headAt.x} ${headAt.y}`,
    length: span - clearFrom - clearTo,
    head: { ...headAt, heading: (Math.atan2(dy, dx) * 180) / Math.PI },
  };
}

/**
 * The cord along a ring round `center`, from one angle to another, stopping
 * short of the rings at both ends: clockwise, or the other way round when
 * `back`. `middle` is the angle halfway along, for what is written beside it.
 */
export function arc(center: Point, ring: number, from: number, to: number, clearFrom: number, clearTo: number, back = false) {
  const at = (angle: number) => ({ x: center.x + ring * Math.cos(angle), y: center.y + ring * Math.sin(angle) });
  const sense = back ? -1 : 1;
  const start = from + (sense * clearFrom) / ring;
  let end = to - (sense * clearTo) / ring;
  while (sense * (end - start) < 0) end += sense * 2 * Math.PI;
  const [tail, head] = [at(start), at(end)];
  const sweep = Math.abs(end - start);
  return {
    d: `M ${tail.x} ${tail.y} A ${ring} ${ring} 0 ${sweep > Math.PI ? 1 : 0} ${back ? 0 : 1} ${head.x} ${head.y}`,
    length: ring * sweep,
    // Going round, the cord heads a quarter turn ahead of where it is (or behind, going back).
    head: { ...head, heading: (end * 180) / Math.PI + sense * 90 },
    middle: (start + end) / 2,
  };
}

interface CordProps {
  /** The path of the cord, from who owes to whom. */
  d: string;
  length: number;
  /** Where it ends, and which way it is going there, in degrees. */
  head: Point & { heading: number };
  /** How thick it is. A new width is grown or thinned into, not swapped. */
  width?: number;
  tone?: CordTone;
  drawn?: boolean;
  delay?: number;
  duration?: number;
}

/** A debt: a cord that draws itself from who owes to whom, with an arrowhead that says so. */
export function Cord({ d, length, head, width = 3, tone = "ink", drawn = true, delay = 0, duration = 0.8 }: CordProps) {
  const draw = useDraw(length, drawn, { delay, duration });
  const thickness = useMotionValue(width);
  useEffect(() => {
    const change = animate(thickness, width, { duration: 1.2, ease: EASE });
    return () => change.stop();
  }, [thickness, width]);

  // The arrowhead is made for the width the cord was born with, and grows or shrinks with it.
  const [born] = useState(width);
  const arrow = useRef<SVGGElement>(null);
  const place = (current: number) => `translate(${head.x} ${head.y}) rotate(${head.heading}) scale(${current / born})`;
  useMotionValueEvent(thickness, "change", (current) => arrow.current?.setAttribute("transform", place(current)));

  return (
    <g pointerEvents="none">
      <motion.path
        d={d}
        fill="none"
        strokeLinecap="round"
        className={`transition-colors duration-700 ${STROKE[tone]}`}
        style={{ ...draw.style, strokeWidth: thickness }}
      />
      <g ref={arrow} transform={place(thickness.get())}>
        <Arrowhead tone={HEAD_TONE[tone]} half={Math.max(5, born * 1.15)} progress={draw.progress} />
      </g>
    </g>
  );
}

/** A ring that draws itself from the top, clockwise. */
export function Ring({
  r,
  drawn,
  delay = 0,
  duration = 0.8,
  className,
  strokeWidth,
}: {
  r: number;
  drawn: boolean;
  delay?: number;
  duration?: number;
  className: string;
  strokeWidth: number;
}) {
  const draw = useDraw(2 * Math.PI * r, drawn, { delay, duration });
  return (
    <motion.path
      d={`M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r}`}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={`transition-colors duration-700 ${className}`}
      style={draw.style}
    />
  );
}

/** The mark of a signature on a node's shoulder, landing with a small spring. */
function Signed({ r }: { r: number }) {
  return (
    <g transform={`translate(${r * 0.72} ${-r * 0.72})`}>
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
        <circle r={r * 0.36} className="fill-free stroke-card" strokeWidth={2.5} />
        <path
          d={`M ${-r * 0.15} 0 L ${-r * 0.04} ${r * 0.11} L ${r * 0.15} ${-r * 0.11}`}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-card"
        />
      </motion.g>
    </g>
  );
}

interface BusinessProps {
  at: Point;
  r: number;
  glyph: GlyphName;
  shown: boolean;
  /** Has signed, or is settled. */
  done?: boolean;
  /** Drawn in the grey of what is not in focus. */
  faint?: boolean;
  /** Changes each time it receives something, and it beats once, `beatDelay` seconds later. */
  beat?: number;
  beatDelay?: number;
  delay?: number;
}

/** One of the three of the story: its ring draws itself, and then its glyph inside. */
export function Business({ at, r, glyph, shown, done = false, faint = false, beat = 0, beatDelay = 0, delay = 0 }: BusinessProps) {
  const pulse = useMotionValue(1);
  useEffect(() => {
    if (beat === 0) return;
    const run = animate(pulse, [1, 1.16, 1], { duration: 0.7, delay: beatDelay, ease: EASE });
    return () => run.stop();
  }, [pulse, beat, beatDelay]);
  return (
    <g transform={`translate(${at.x} ${at.y})`} pointerEvents="none">
      <motion.g style={{ scale: pulse }}>
        <motion.circle
          r={r}
          className="lift fill-card"
          initial={false}
          animate={{ scale: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 20, delay: shown ? delay : 0 }}
        />
        <Ring
          r={r}
          drawn={shown}
          delay={delay}
          strokeWidth={3}
          className={done ? "stroke-free" : faint ? "stroke-muted-soft" : "stroke-ink"}
        />
        <Glyph
          name={glyph}
          size={r * 1.25}
          drawn={shown}
          delay={delay + 0.35}
          className={`transition-colors duration-700 ${faint ? "text-muted-soft" : "text-ink"}`}
        />
        {done && <Signed r={r} />}
      </motion.g>
    </g>
  );
}

/** Any other business: a small grey ring that draws itself. */
export function Dot({ at, r, shown, delay = 0, done = false }: { at: Point; r: number; shown: boolean; delay?: number; done?: boolean }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`} pointerEvents="none">
      <motion.circle
        r={r}
        className="fill-card"
        initial={false}
        animate={{ scale: shown ? 1 : 0 }}
        transition={{ duration: 0.5, delay: shown ? delay : 0, ease: EASE }}
      />
      <Ring r={r} drawn={shown} delay={delay} strokeWidth={2} className={done ? "stroke-free" : "stroke-muted-soft"} />
    </g>
  );
}

/** A bloom of colour laid on the world, behind what is drawn there. */
export function Glow({ at, size, color, className = "" }: { at: Point; size: number; color: string; className?: string }) {
  return (
    <foreignObject x={at.x - size / 2} y={at.y - size / 2} width={size} height={size} pointerEvents="none">
      <div className="relative size-full">
        <Bloom color={color} className={`inset-0 size-full ${className}`} />
      </div>
    </foreignObject>
  );
}

/*
 * The words on the drawing, in pixels of the frame: they go in a `Pin`.
 */

const TYPE = {
  kicker: { size: 24, leading: 1.5, className: "eyebrow fill-muted" },
  note: { size: 28, leading: 1.35, className: "fill-muted" },
  label: { size: 28, leading: 1.35, className: "fill-ink font-medium" },
  title: { size: 44, leading: 1.2, className: "display fill-ink" },
  figure: { size: 72, leading: 1.05, className: "display fill-ink" },
  mono: { size: 24, leading: 1.45, className: "font-mono fill-muted" },
  source: { size: 24, leading: 1.45, className: "fill-muted" },
} satisfies Record<string, { size: number; leading: number; className: string }>;

export interface Line {
  text: ReactNode;
  kind?: keyof typeof TYPE;
  /** Replaces the colour of its kind. */
  className?: string;
  /** Space above it, in pixels. */
  gap?: number;
}

const heightOf = (lines: Line[]) =>
  lines.reduce((sum, line) => sum + (line.gap ?? 0) + TYPE[line.kind ?? "note"].size * TYPE[line.kind ?? "note"].leading, 0);

type Anchor = "start" | "middle" | "end";
type Rows = "top" | "middle" | "bottom";

/** Lines of text set one under the other, hanging from `y`, centred on it, or standing on it. */
export function Lines({
  lines,
  x = 0,
  y = 0,
  anchor = "start",
  rows = "top",
}: {
  lines: Line[];
  x?: number;
  y?: number;
  anchor?: Anchor;
  rows?: Rows;
}) {
  const height = heightOf(lines);
  const start = rows === "top" ? y : rows === "middle" ? y - height / 2 : y - height;
  // Where each line's own box starts, one under the other.
  const tops = lines.map((_, index) => start + heightOf(lines.slice(0, index)) + (lines[index]!.gap ?? 0));
  return (
    <>
      {lines.map((line, index) => {
        const type = TYPE[line.kind ?? "note"];
        // The baseline sits where the line's own height, less its descent, ends.
        const baseline = tops[index]! + type.size * (type.leading / 2 + 0.35);
        const style: CSSProperties = { fontSize: type.size };
        return (
          <text key={index} x={x} y={baseline} textAnchor={anchor} className={`${type.className} ${line.className ?? ""}`} style={style}>
            {line.text}
          </text>
        );
      })}
    </>
  );
}

interface NoteProps {
  shown: boolean;
  /** Where the words go, from the point it is pinned to, in pixels of the frame. */
  to: Point;
  lines: Line[];
  /** Which way the words run from there. */
  anchor?: Anchor;
  rows?: Rows;
  /** A hairline from the point to the words. */
  leader?: boolean;
  /** How far from the point the hairline starts. */
  clear?: number;
  delay?: number;
  /** Drawn beside the words, at `to`. */
  children?: ReactNode;
}

/**
 * A note about whatever it is pinned to: a hairline drawn out from it, and
 * the words coming out along the hairline after it.
 */
export function Note({ shown, to, lines, anchor = "start", rows = "middle", leader = true, clear = 0, delay = 0, children }: NoteProps) {
  const span = Math.hypot(to.x, to.y) || 1;
  const [ux, uy] = [to.x / span, to.y / span];
  const length = Math.max(0, span - clear - 10);
  const draw = useDraw(length, shown && leader, { delay, duration: 0.6 });
  const pad = anchor === "start" ? 14 : anchor === "end" ? -14 : 0;
  const lift = rows === "top" ? 12 : rows === "bottom" ? -12 : 0;
  return (
    <g pointerEvents="none">
      {leader && length > 0 && (
        <motion.path
          d={`M ${ux * clear} ${uy * clear} L ${ux * (span - 10)} ${uy * (span - 10)}`}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="stroke-hairline-strong"
          style={draw.style}
        />
      )}
      <motion.g
        initial={false}
        animate={shown ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: -ux * 24, y: -uy * 24 }}
        transition={{ duration: 0.6, delay: shown ? delay + (leader ? 0.35 : 0) : 0, ease: EASE }}
      >
        {children}
        <Lines lines={lines} x={to.x + pad} y={to.y + lift} anchor={anchor} rows={rows} />
      </motion.g>
    </g>
  );
}
