"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { INK } from "@/lib/tones";
import { useDraw } from "../cord";
import { FRAME, type Shot } from "./camera";
import { Lines } from "./drawing";
import { position } from "./scenes";

/*
 * Where the video starts, to the right of the triangle: how long a business
 * waits to be paid, on a card as the app would draw it. A ruler of days,
 * the mark of the law at day 30, and two bars that the voice brings one
 * after the other: the average, which goes past the law to 44, and what it
 * is between small businesses, which gets to the law and then goes on to
 * 53. What goes past the law is in the ink of what is owed, and says by how
 * much.
 */

/** The shot that holds the card, and the size of a pixel of the frame, in units of the world, at that shot: the card is laid out in pixels. */
export const DAYS_SHOT: Shot = { x: 960, y: 300, width: 1500 };
const PIXEL = DAYS_SHOT.width / FRAME.width;

/** The card, from the middle of the frame, a little above it: the subtitles go underneath. */
const CARD = { x: -720, y: -440, width: 1440, height: 740, radius: 36 };
const PAD = 72;
/** Where day 0 is, how wide a day is, and how many the ruler has. */
const LEFT = CARD.x + PAD + 40;
const DAY = 15;
const LAST = 60;
const LAW = 30;
const THICK = 22;
const RULER = -140;
const ROWS = {
  average: { y: -20, days: 44, name: "Promedio real" },
  between: { y: 150, days: 53, name: "Entre pymes" },
};
const dayAt = (days: number) => LEFT + days * DAY;

/** When the card comes in after its step starts (the camera is still getting there), and how long a bar takes to get to the law and from there to its end. */
const TIMING = { enters: 0.6, toLaw: 0.6, past: (days: number) => 0.35 + ((days - LAW) * DAY) / 900 };

/** A stretch of a line that draws itself. */
function Stroke({
  d,
  length,
  drawn,
  delay = 0,
  duration = 0.6,
  width,
  className,
}: {
  d: string;
  length: number;
  drawn: boolean;
  delay?: number;
  duration?: number;
  width: number;
  className: string;
}) {
  const draw = useDraw(length, drawn, { delay, duration });
  return <motion.path d={d} fill="none" strokeWidth={width} strokeLinecap="round" className={className} style={draw.style} />;
}

/** Something that comes in from just below, and goes the same way. */
function Rise({ shown, delay = 0, children }: { shown: boolean; delay?: number; children: ReactNode }) {
  return (
    <motion.g
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
      transition={{ duration: 0.6, delay: shown ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.g>
  );
}

/** A figure that counts its way from the law to where its bar ends. */
function Count({ to, counting, delay, duration }: { to: number; counting: boolean; delay: number; duration: number }) {
  const value = useMotionValue(LAW);
  useEffect(() => {
    const count = animate(value, counting ? to : LAW, { duration: counting ? duration : 0, delay: counting ? delay : 0, ease: EASE });
    return () => count.stop();
  }, [value, to, counting, delay, duration]);
  const text = useTransform(value, (current) => Math.round(current).toString());
  return (
    <motion.text className="display fill-debt-deep tabular-nums" style={{ fontSize: 104 }}>
      {text}
    </motion.text>
  );
}

/** A chip as the app's, drawn: a pill in the soft of its ink. */
function Chip({ x, y, text }: { x: number; y: number; text: string }) {
  const width = 44 + text.length * 15.5;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={-23} width={width} height={46} rx={23} className={INK.debt.softFill} />
      <text
        x={width / 2}
        y={9}
        textAnchor="middle"
        className="fill-debt-deep font-semibold uppercase"
        style={{ fontSize: 24, letterSpacing: "0.07em" }}
      >
        {text}
      </text>
    </g>
  );
}

interface Row {
  y: number;
  days: number;
  name: string;
}

/**
 * A bar of days on its track: in ink up to the law, in the ink of what is
 * owed past it. `started` draws it up to the law a step before it goes on,
 * where it `waits`. Its figure counts up as it goes, and the chip says by
 * how many days it is late.
 */
function Bar({
  row,
  shown,
  started,
  drawn,
  waits = false,
}: {
  row: Row;
  shown: boolean;
  started: boolean;
  drawn: boolean;
  waits?: boolean;
}) {
  const past = TIMING.past(row.days);
  const toLaw = waits ? 0 : TIMING.toLaw;
  const along = (from: number, to: number) => ({ d: `M ${dayAt(from)} ${row.y} L ${dayAt(to)} ${row.y}`, length: (to - from) * DAY });
  // The figures go in a column past the end of the track, so that the two can be read against each other.
  const column = dayAt(LAST) + 44;
  return (
    <g>
      <Rise shown={shown} delay={TIMING.enters + 0.5}>
        <Lines lines={[{ text: row.name, kind: "kicker" }]} x={LEFT - THICK / 2} y={row.y - 30} rows="bottom" />
      </Rise>
      <Stroke
        {...along(0, LAST)}
        drawn={shown}
        delay={TIMING.enters + 0.4}
        duration={0.9}
        width={THICK}
        className="stroke-surface-strong"
      />
      <Stroke {...along(0, LAW)} drawn={started} duration={TIMING.toLaw} width={THICK} className="stroke-ink" />
      <Stroke {...along(LAW, row.days)} drawn={drawn} delay={drawn ? toLaw : 0} duration={past} width={THICK} className="stroke-debt" />
      <Rise shown={drawn} delay={toLaw + past * 0.35}>
        <g transform={`translate(${column} ${row.y + 34})`}>
          <Count to={row.days} counting={drawn} delay={toLaw} duration={past} />
          <text x={122} className="fill-ink font-medium" style={{ fontSize: 30 }}>
            días
          </text>
        </g>
      </Rise>
      <Rise shown={drawn} delay={toLaw + past + 0.15}>
        <Chip x={column + 122 + 84} y={row.y + 22} text={`+${row.days - LAW}`} />
      </Rise>
    </g>
  );
}

export function Days({ g }: { g: number }) {
  const p = position;
  // The card is there from when the camera gets to it until it leaves along the chain.
  const here = g >= p("problema", 2) && g < p("problema", 7);
  const law = here && g >= p("problema", 3);
  const top = RULER - 34;
  const bottom = ROWS.between.y + 54;
  return (
    <g transform={`translate(${DAYS_SHOT.x} ${DAYS_SHOT.y}) scale(${PIXEL})`} pointerEvents="none">
      <motion.g
        initial={false}
        animate={here ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.975 }}
        transition={{ duration: here ? 0.7 : 0.5, delay: here ? TIMING.enters : 0, ease: EASE }}
      >
        <rect
          x={CARD.x}
          y={CARD.y}
          width={CARD.width}
          height={CARD.height}
          rx={CARD.radius}
          className="fill-card stroke-hairline"
          strokeWidth={1.5}
          style={{ filter: "drop-shadow(0 18px 44px rgb(12 10 9 / 0.08))" }}
        />
        <Lines
          lines={[
            { text: "En Chile", kind: "kicker" },
            { text: "Días que tarda en pagarse una factura", kind: "title", gap: 6 },
          ]}
          x={CARD.x + PAD}
          y={CARD.y + PAD - 14}
        />

        {/* The ruler: a tick and a figure every ten days. */}
        {[0, 10, 20, 30, 40, 50, 60].map((days) => (
          <g key={days} transform={`translate(${dayAt(days)} ${RULER})`}>
            <line y1={0} y2={12} strokeWidth={2} strokeLinecap="round" className="stroke-hairline-strong" />
            {/* At 30 the pill of the law says it. */}
            {days !== LAW && (
              <text y={-12} textAnchor="middle" className="fill-muted tabular-nums" style={{ fontSize: 24 }}>
                {days}
              </text>
            )}
          </g>
        ))}

        <Bar row={ROWS.average} shown={here} started={here && g >= p("problema", 4)} drawn={here && g >= p("problema", 4)} />
        <Bar row={ROWS.between} shown={here} started={here && g >= p("problema", 5)} drawn={here && g >= p("problema", 6)} waits />

        {/* The mark of the law, through both bars, and what it is, on an ink pill. */}
        <Stroke
          d={`M ${dayAt(LAW)} ${top} L ${dayAt(LAW)} ${bottom}`}
          length={bottom - top}
          drawn={law}
          duration={0.7}
          width={3}
          className="stroke-ink"
        />
        <Rise shown={law} delay={0.25}>
          <g transform={`translate(${dayAt(LAW)} ${top - 34})`}>
            <rect x={-150} y={-27} width={300} height={54} rx={27} className="fill-primary" />
            <text y={9} textAnchor="middle" className="fill-card font-medium" style={{ fontSize: 26 }}>
              La ley: 30 días
            </text>
          </g>
        </Rise>

        <Lines
          lines={[{ text: "Bolsa de Productos, Ranking de Pagadores 2025–2026 · Xepelin, Radiografía Pyme 2025", kind: "source" }]}
          x={CARD.x + PAD}
          y={CARD.y + CARD.height - PAD - 18}
        />
      </motion.g>
    </g>
  );
}
