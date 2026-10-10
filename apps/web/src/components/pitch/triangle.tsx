"use client";

import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { EASE, UNTYING } from "@/lib/motion";
import { INK } from "@/lib/tones";
import { Tie } from "../circle-graph";
import { Pin, type Point } from "./camera";
import { untyingAt, useLocal } from "./clock";
import { Business, Cord, Glow, Lines, Note, Ring, arc, type CordTone } from "./drawing";
import type { GlyphName } from "./glyphs";
import { position } from "./scenes";
import { timeOf } from "./timeline";

/*
 * The middle of the world: the bakery owes the mill 100, the mill owes the
 * carrier 80, the carrier owes the bakery 90. It is drawn one business and
 * one debt at a time, and never leaves: the web grows round it, the camera
 * goes off to the twenty and comes back, and what Nodus does with it is
 * done to these same cords, which thin, let go and are pulled into a knot.
 */

/** How far from the middle the three sit, and how large they are, in units of the world. */
export const RING = 240;
const R = 46;
const ORIGIN: Point = { x: 0, y: 0 };
const on = (angle: number, radius = RING): Point => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });

type Side = "left" | "right" | "below";

/** The three, clockwise from the bakery at the bottom. */
const PARTIES: { name: string; glyph: GlyphName; angle: number; side: Side }[] = [
  { name: "Panadería Sur", glyph: "panaderia", angle: Math.PI / 2, side: "below" },
  { name: "Molino Andes", glyph: "molino", angle: Math.PI / 2 + (2 * Math.PI) / 3, side: "left" },
  { name: "Fletes Ruta 5", glyph: "fletes", angle: Math.PI / 2 + (4 * Math.PI) / 3, side: "right" },
];
/** Where each of the three is, for whatever grows from them. */
export const PLACES = PARTIES.map((party) => ({ at: on(party.angle), angle: party.angle }));
const MILL_INDEX = 1;
const MILL = PLACES[MILL_INDEX]!.at;

/**
 * When things land after their step starts, in seconds, so that each lands
 * as the voice says it: a debt's cord finishes drawing (and its amount comes
 * out of it) as the amount is said, about a second and a half into the line;
 * the 270 waits for the ring to close; the count from 270 down to 20 lands
 * on "veinte"; the carrier's 10 waits for the voice to get from the bakery
 * to it.
 */
const TIMING = { cords: [0.45, 0.35, 0.5, 0], amount: 1.05, counterAppears: 1.5, countDown: 0.3, carrierPays: 0.9 };

/** Cord width grows with the square root of the amount, as in the app. */
const thickness = (amount: number) => 2.5 + 11.5 * Math.sqrt(amount / 100);

/** A stretch of the ring from one of the three to another, clockwise, or the short way back. */
const stretch = (from: number, to: number, back = false) =>
  arc(ORIGIN, RING, PARTIES[from]!.angle, PARTIES[to]!.angle, R + 10, R + 16, back);

type Mode = "debts" | "bare" | "net" | "cleared" | "reduced";

/**
 * The four cords the story needs, and what each says before and after
 * settling. The bakery's debt with the mill is the same cord throughout: it
 * is taken back with the other two, and comes back as the 10 it pays.
 */
const CORDS: { shape: ReturnType<typeof stretch>; amounts: Partial<Record<Mode, number>>; order: number }[] = [
  { shape: stretch(0, 1), amounts: { debts: 100, net: 10, reduced: 20 }, order: 0 },
  { shape: stretch(1, 2), amounts: { debts: 80 }, order: 1 },
  { shape: stretch(2, 0), amounts: { debts: 90, reduced: 10 }, order: 2 },
  // The carrier never owed the mill: its 10 goes the short way round, where the mill's 80 was.
  { shape: stretch(2, 1, true), amounts: { net: 10 }, order: 3 },
];

/** Where the triangle is at a step of the video. */
function stateAt(g: number) {
  const p = position;
  // The debts are taken back all at once, then what is left to pay is drawn. In the web, after the idea, the three have their debts again.
  const mode: Mode =
    g < p("idea", 5)
      ? "debts"
      : g < p("idea", 6)
        ? "bare"
        : g < p("idea", 8)
          ? "net"
          : g < p("caja")
            ? "cleared"
            : g < p("caja", 2)
              ? "debts"
              : g < p("red")
                ? "reduced"
                : g < p("demo")
                  ? "debts"
                  : "cleared";
  return {
    mode,
    nodes: g < p("nudo", 1) ? 0 : g < p("nudo", 2) ? 2 : 3,
    cords: g < p("nudo", 1) ? 0 : g < p("nudo", 2) ? 1 : g < p("nudo", 3) ? 2 : 3,
    // Nodus sees the circle before it settles it: the three debts light up as one.
    seen: (g >= p("idea", 1) && g < p("idea", 4)) || g === p("caja", 1),
    // In the web the bakery's two debts take its inks, then the three are lost among the rest, then lit, then found.
    inWeb: g >= p("red", 1) && g < p("demo"),
    // Their names would be in the way of what grows from them.
    named: g < p("red", 1) || g >= p("demo"),
    owes: (g >= p("red", 1) && g < p("red", 3)) || g === p("red", 6),
    owed: (g >= p("red", 2) && g < p("red", 3)) || g === p("red", 6),
    faint: g >= p("red", 3) && g < p("red", 8),
    // "Each one sees only its own": the bakery alone, among all the rest.
    alone: g === p("red", 6),
    found: g >= p("red", 9) && g < p("demo"),
    closing: g >= p("cierre"),
  };
}

/** Which of the counter's words go with the figure in the middle of the ring. */
function counterAt(g: number, mode: Mode): { figure: number; kicker: string; caption: string[]; done: boolean } | null {
  const p = position;
  if (g < p("nudo", 3) || (g >= p("red", 1) && g < p("demo")) || g >= p("cierre")) return null;
  if (g >= p("caja") && g < p("red")) {
    if (g === p("caja", 0)) return { figure: 270, kicker: "el mismo ejemplo", caption: ["en deudas"], done: false };
    if (g === p("caja", 1)) return { figure: 80, kicker: "se descuentan", caption: ["de cada deuda"], done: false };
    if (g < p("caja", 5)) return { figure: 0, kicker: "sin mover plata", caption: ["dinero movido"], done: true };
    if (g === p("caja", 5)) return { figure: 270, kicker: "al inicio", caption: ["en deudas"], done: false };
    return { figure: 30, kicker: "quedan por pagar", caption: ["de 270 en deudas"], done: false };
  }
  if (g === p("nudo", 4))
    return {
      figure: 270,
      kicker: "",
      caption: ["Los tres tienen dinero por cobrar,", "pero ninguno tiene suficiente", "para pagar."],
      done: false,
    };
  // What is left to move is counted before the cords that move it are drawn.
  if (g >= p("idea", 5) && g < p("idea", 8)) return { figure: 20, kicker: "basta con mover", caption: ["de 270 en deudas"], done: false };
  return {
    debts: { figure: 270, kicker: "", caption: ["en deudas"], done: false },
    bare: { figure: 270, kicker: "", caption: ["en deudas"], done: false },
    net: { figure: 20, kicker: "basta con mover", caption: ["de 270 en deudas"], done: false },
    cleared: { figure: 270, kicker: "se saldaron", caption: ["moviendo 20"], done: true },
    reduced: { figure: 30, kicker: "quedan por pagar", caption: ["de 270 en deudas"], done: false },
  }[mode];
}

/** Words that change in place: the old ones leave as the new ones come. */
function Swap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      <motion.g
        key={id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        {children}
      </motion.g>
    </AnimatePresence>
  );
}

/** The figure in the middle of the ring, which counts its way to each new value. */
function Counter({ state }: { state: ReturnType<typeof counterAt> }) {
  const value = useMotionValue(0);
  // While it is away it keeps the figure it had, and counts on from it when it comes back: after the knot, from the 20 moved up to the 270 cancelled.
  const [last, setLast] = useState(0);
  if (state && state.figure !== last) setLast(state.figure);
  const figure = state?.figure ?? last;
  // It waits for what it counts: the third cord to close the ring, or the cords to thin to what is paid, so that it lands on its figure as the voice says it.
  const now = state ? figure : null;
  const [shown, setShown] = useState({ figure: now, wait: 0 });
  if (shown.figure !== now)
    setShown({
      figure: now,
      wait:
        shown.figure === null ? (value.get() === 0 ? TIMING.counterAppears : 0) : now !== null && now < shown.figure ? TIMING.countDown : 0,
    });
  const wait = shown.wait;
  useEffect(() => {
    const count = animate(value, figure, { duration: 1.4, delay: wait, ease: EASE });
    return () => count.stop();
  }, [value, figure, wait]);
  const text = useTransform(value, (current) => Math.round(current).toString());
  const kicker = state?.kicker ?? "";
  const caption = state?.caption ?? [];
  return (
    <Pin {...ORIGIN}>
      <motion.g
        initial={false}
        animate={{ opacity: state ? 1 : 0, scale: state ? 1 : 0.85 }}
        transition={{ duration: 0.6, delay: state ? wait : 0, ease: EASE }}
        pointerEvents="none"
      >
        <Swap id={kicker}>
          <Lines lines={[{ text: kicker, kind: "kicker" }]} y={-78} anchor="middle" rows="bottom" />
        </Swap>
        <motion.text
          y={40}
          textAnchor="middle"
          className={`display tabular-nums transition-colors duration-700 ${state?.done ? "fill-free" : "fill-ink"}`}
          style={{ fontSize: 124 }}
        >
          {text}
        </motion.text>
        <Swap id={caption.join(" ")}>
          <Lines lines={caption.map((text) => ({ text }))} y={70} anchor="middle" />
        </Swap>
      </motion.g>
    </Pin>
  );
}

/** The amount of a cord, beside its middle, counting to each new value; it comes out of the cord with it. */
function Amount({
  angle,
  value,
  shown,
  delay = TIMING.amount,
  subtract = false,
}: {
  angle: number;
  value: number;
  shown: boolean;
  delay?: number;
  subtract?: boolean;
}) {
  const figure = useMotionValue(value);
  useEffect(() => {
    const count = animate(figure, value, { duration: 1.2, ease: EASE });
    return () => count.stop();
  }, [figure, value]);
  const text = useTransform(figure, (current) => Math.round(current).toString());
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
  const away = 40;
  return (
    <Pin {...on(angle)}>
      <motion.g
        initial={false}
        animate={shown ? { opacity: 1, x: cos * away, y: sin * away } : { opacity: 0, x: 0, y: 0 }}
        transition={{ duration: 0.7, delay: shown ? delay : 0, ease: EASE }}
      >
        <motion.text
          y={sin < -0.3 ? -4 : sin > 0.3 ? 46 : 22}
          textAnchor={anchor}
          className="display fill-ink tabular-nums"
          style={{ fontSize: 60 }}
        >
          {text}
        </motion.text>
        <motion.text
          y={sin < -0.3 ? -48 : sin > 0.3 ? 88 : 64}
          textAnchor={anchor}
          className="fill-free font-medium tabular-nums"
          style={{ fontSize: 32 }}
          initial={false}
          animate={{ opacity: subtract ? 1 : 0, y: subtract ? 0 : 8 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          −80
        </motion.text>
      </motion.g>
    </Pin>
  );
}

/** The name of one of the three, beside it, and whatever is said about it at the moment. */
function Name({ at, side, name, shown }: { at: Point; side: Side; name: string; shown: boolean }) {
  const offset = { left: { x: -64, y: 0 }, right: { x: 64, y: 0 }, below: { x: 0, y: 70 } }[side];
  const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
  return (
    <Pin {...at}>
      <motion.g
        initial={false}
        animate={shown ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: -offset.x * 0.3, y: -offset.y * 0.3 }}
        transition={{ duration: 0.6, delay: shown ? 0.5 : 0, ease: EASE }}
      >
        <Lines
          lines={[{ text: name, kind: "label" }]}
          x={offset.x}
          y={offset.y}
          anchor={anchor}
          rows={side === "below" ? "top" : "middle"}
        />
      </motion.g>
    </Pin>
  );
}

export function Triangle({ g }: { g: number }) {
  const { mode, nodes, cords, seen, inWeb, named, owes, owed, faint, alone, found, closing } = stateAt(g);
  const settled = mode === "cleared";
  // The knot is pulled tight and lets go from the step that settles the circle, on the clock.
  const untying = useLocal((local) => (settled ? untyingAt(local - (timeOf("idea", 8, local) ?? -Infinity)) : null));
  const tight = untying === "tight";
  // From "an example" on, the place is set.
  const staged = g >= position("nudo");
  const tone: CordTone = found || seen ? "free" : faint ? "neutral" : "ink";
  // What the bakery owes the mill, and what the carrier owes it, in its own inks while the web is only its own.
  const toneOf = (order: number): CordTone => (order === 0 && owes ? "debt" : order === 2 && owed ? "credit" : tone);
  const paying = mode === "net";
  const p = position;
  const noCash = g >= p("caja") && g < p("red");
  const counter = counterAt(g, mode);

  return (
    <g>
      <Glow at={{ x: 60, y: 10 }} size={1100} color={settled && !tight ? INK.free.bloom : INK.credit.bloom} className="opacity-70" />
      <Glow at={{ x: -260, y: 120 }} size={640} color={INK.debt.bloom} className="opacity-50" />

      {/* What is left of the ring once it lets go. */}
      <motion.circle
        r={RING}
        fill="none"
        strokeWidth={2}
        strokeDasharray="3 10"
        className="stroke-free/60"
        initial={false}
        animate={settled && !tight ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.3 }}
        transition={{ duration: untying ? UNTYING.loose * 0.85 : 0.4, ease: EASE }}
      />

      {/* The ring and its debts, which settling pulls into the middle. */}
      <motion.g
        initial={false}
        animate={settled ? { opacity: 0, scale: 0.16, rotate: 150 } : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: tight ? UNTYING.tight * 0.6 : noCash ? 0.7 : 0, ease: EASE }}
      >
        {/* Holds nothing to see: keeps the middle of the group on the middle of the ring. */}
        <rect x={-RING - 60} y={-RING - 60} width={2 * (RING + 60)} height={2 * (RING + 60)} fill="none" />
        {/* The circle they will make, which draws itself before any of them is there. */}
        <motion.g initial={false} animate={{ opacity: faint ? 0 : 1 }} transition={{ duration: 0.8 }}>
          <Ring r={RING} drawn={staged} delay={0.5} duration={1.8} strokeWidth={1.5} className="stroke-hairline-strong" />
        </motion.g>
        {CORDS.map((cord) => {
          // A cord settled away is taken back once the knot has let go, so that it is not there when the debts come back.
          const amount = cord.amounts[settled ? "net" : mode];
          const drawn = amount !== undefined && (mode !== "debts" || cords > cord.order) && (!settled || tight);
          return (
            <Cord
              key={cord.order}
              d={cord.shape.d}
              length={cord.shape.length}
              head={cord.shape.head}
              width={thickness(amount ?? 10)}
              tone={
                mode === "reduced"
                  ? cord.order === 0 && g === p("caja", 3)
                    ? "debt"
                    : cord.order === 2 && g === p("caja", 4)
                      ? "credit"
                      : "ink"
                  : toneOf(cord.order)
              }
              drawn={drawn}
              // The carrier's payment waits for the voice to get to it.
              delay={paying ? (cord.order === 3 ? TIMING.carrierPays : 0) : TIMING.cords[cord.order]}
              duration={1.1}
            />
          );
        })}
      </motion.g>

      {untying && (
        <g transform={`scale(${RING / 136})`}>
          <Tie loose={untying === "loose"} center={ORIGIN} ring={136} />
        </g>
      )}

      {PARTIES.map((party, index) => (
        <Business
          key={party.name}
          at={PLACES[index]!.at}
          r={R}
          glyph={party.glyph}
          shown={nodes > index}
          delay={index === 1 ? 0.5 : 0}
          done={(settled && !tight) || found}
          faint={faint && !(alone && index === 0)}
          // The mill beats once as it is said to receive both payments of 10.
          beat={index === MILL_INDEX && g === p("idea", 7) ? 1 : 0}
          beatDelay={0.45}
        />
      ))}

      {CORDS.map((cord) => {
        const amount = cord.order === 1 && g === p("caja", 2) ? 0 : cord.amounts[mode];
        const shown = amount !== undefined && (mode !== "debts" || cords > cord.order) && !inWeb && !closing;
        const delay = paying ? (cord.order === 3 ? TIMING.carrierPays + 0.5 : 0.6) : TIMING.amount;
        return (
          <Amount
            key={cord.order}
            angle={cord.shape.middle}
            value={amount ?? 0}
            shown={shown}
            delay={noCash ? 0 : delay}
            subtract={g === p("caja", 1)}
          />
        );
      })}

      <Counter state={tight ? null : counter} />

      {PARTIES.map((party, index) => (
        <Name key={party.name} at={PLACES[index]!.at} side={party.side} name={party.name} shown={nodes > index && !closing && named} />
      ))}

      {/* Before the three are there, the place set for them: where each will be, and that it is an example. */}
      {PLACES.map((place, index) => (
        <motion.circle
          key={index}
          cx={place.at.x}
          cy={place.at.y}
          r={R}
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 9"
          strokeLinecap="round"
          className="stroke-muted-soft"
          initial={false}
          animate={{ opacity: staged && nodes <= index ? 1 : 0, scale: staged ? 1 : 0.6 }}
          transition={{ duration: 0.6, delay: staged && nodes === 0 ? 0.7 + index * 0.3 : 0, ease: EASE }}
        />
      ))}
      <Pin {...ORIGIN}>
        <Note
          shown={g >= p("nudo") && g < p("nudo", 3)}
          to={{ x: 0, y: 0 }}
          leader={false}
          anchor="middle"
          rows="middle"
          delay={0.9}
          lines={[{ text: "Un ejemplo sencillo", kind: "kicker" }]}
        />
      </Pin>

      {/* Over the circle, what was made for it, and what it does. */}
      <Pin x={0} y={-RING}>
        <Note
          shown={noCash}
          to={{ x: 0, y: -120 }}
          leader={false}
          anchor="middle"
          rows="bottom"
          lines={[{ text: "Sin usar caja", kind: "title" }]}
        />
        <Note
          shown={g >= p("idea", 2) && g < p("idea", 4)}
          to={{ x: 0, y: -196 }}
          leader={false}
          anchor="middle"
          rows="bottom"
          lines={[{ text: "Nodus", kind: "figure" }]}
        />
        <Note
          shown={g === p("idea", 3)}
          to={{ x: 0, y: -150 }}
          leader={false}
          anchor="middle"
          rows="bottom"
          lines={[{ text: "Compensa las deudas: solo se paga la diferencia." }]}
        />
      </Pin>

      <Pin x={0} y={RING}>
        <Note
          shown={g === p("caja", 6)}
          to={{ x: 0, y: 154 }}
          leader={false}
          anchor="middle"
          rows="top"
          lines={[{ text: "240 compensados · 0 dinero movido", kind: "label", className: "fill-free" }]}
        />
      </Pin>

      {/* Beside the mill, what it receives. */}
      <Pin {...MILL}>
        <Note
          shown={g === p("idea", 7)}
          to={{ x: -84, y: -84 }}
          clear={R + 8}
          anchor="end"
          rows="bottom"
          delay={0.3}
          lines={[{ text: "Recibe 20", kind: "label" }]}
        />
      </Pin>
    </g>
  );
}
