"use client";

import { motion } from "motion/react";

import { useDraw } from "../cord";

export type GlyphName = "panaderia" | "molino" | "fletes";

/** Each glyph: its paths in a 32×32 box centred on (16,16), and the length of each path for drawing it stroke by stroke. */
export const GLYPHS: Record<GlyphName, { paths: string[]; lengths: number[] }> = {
  // A loaf with three scores.
  panaderia: {
    paths: ["M5 24 H27 V16 A11 8.5 0 0 0 5 16 Z", "M10.5 14 L13 19 M15.5 12.5 L18 17.5 M20.5 14 L23 19"],
    lengths: [68.76, 16.77],
  },
  // A windmill: the tower, then the four sails.
  molino: {
    paths: ["M10 28 L12.5 18.5 L16 15 L19.5 18.5 L22 28 Z", "M9.5 4.5 L22.5 17.5 M22.5 4.5 L9.5 17.5"],
    lengths: [41.55, 36.77],
  },
  // A delivery truck in side view: the box and the cab, then the two wheels.
  fletes: {
    paths: [
      "M6 21 H4 V8 H18 V21 H12 M18 12 H23 L28 17 V21 H26 M18 21 H20",
      "M12 22.5 A3 3 0 1 0 6 22.5 A3 3 0 1 0 12 22.5 M26 22.5 A3 3 0 1 0 20 22.5 A3 3 0 1 0 26 22.5",
    ],
    lengths: [68.07, 37.7],
  },
};

interface StrokeProps {
  d: string;
  length: number;
  drawn: boolean;
  delay: number;
}

function Stroke({ d, length, drawn, delay }: StrokeProps) {
  const draw = useDraw(length, drawn, { delay, duration: 0.6 });
  return <motion.path d={d} style={draw.style} />;
}

interface Props {
  name: GlyphName;
  size: number;
  drawn?: boolean;
  delay?: number;
  className?: string;
}

/** The glyph as an SVG group centred on (0,0), `size` units wide, each path drawing itself in turn when `drawn`. */
export function Glyph({ name, size, drawn = true, delay = 0, className = "" }: Props) {
  const { paths, lengths } = GLYPHS[name];
  return (
    <g
      className={className}
      transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 32})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d, i) => (
        <Stroke key={d} d={d} length={lengths[i]} drawn={drawn} delay={delay + i * 0.15} />
      ))}
    </g>
  );
}
