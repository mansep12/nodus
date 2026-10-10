"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { Arrowhead, useDraw } from "../cord";
import { Lines, Ring, type Line } from "./drawing";

/*
 * The two ways of doing it, each drawn the same way so that they can be told
 * apart at a glance: an amount sets off, passes through whatever stands in
 * the middle, and what is left of it arrives.
 *
 * Today the one in the middle is a business, and it keeps a part: in the ink
 * of what is owed, the only thing in that ink in the frame. The figures are
 * an example worked from what factoring costs (between 1 % and 2.2 % a
 * month) over the 53 days one small business takes to pay another: 100 at
 * 2.2 % for 53 days leaves 96.
 *
 * On Stellar it is a contract, and it keeps nothing: the 20 of the example
 * of the three (two pay 10 each, the mill receives 20) go in and come out
 * in the same transaction.
 */

/** The column is this wide, in pixels of the frame, and starts this far from the point of the ring it hangs from. */
const WIDTH = 430;
const CLEAR = 100;
const NODE = 28;
const DROP = 54;

/** When each part comes, in seconds from when the voice gets to it. */
const AT = { head: 0.35, sent: 0.7, road: 1, node: 1.25, travel: 1.5, take: 2.4, arrive: 2.75 };

const INKS = {
  debt: { stroke: "stroke-debt", soft: "fill-debt-soft", deep: "fill-debt-deep" },
  free: { stroke: "stroke-free", soft: "fill-free-soft", deep: "fill-free-deep" },
};

/** Comes up into place, and goes at once. */
function Rise({ shown, delay, children }: { shown: boolean; delay: number; children: ReactNode }) {
  return (
    <motion.g
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.6, delay: shown ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.g>
  );
}

/** A figure that counts from one amount to another. */
function Count({ from, to, counting, delay, sign = "" }: { from: number; to: number; counting: boolean; delay: number; sign?: string }) {
  const value = useMotionValue(from);
  useEffect(() => {
    const count = animate(value, counting ? to : from, { duration: counting ? 0.7 : 0, delay: counting ? delay : 0, ease: EASE });
    return () => count.stop();
  }, [value, from, to, counting, delay]);
  const text = useTransform(value, (current) => `${sign}${Math.round(current)}`);
  return <motion.tspan>{text}</motion.tspan>;
}

interface PassageProps {
  shown: boolean;
  /** Which side of the ring it hangs on: its words run towards the ring on the left, and away from it on the right. */
  side: "left" | "right";
  top: number;
  tone: keyof typeof INKS;
  head: Line[];
  /** What sets off, and what it is called. */
  sent: { amount: number; label: string };
  /** What arrives. */
  arrives: { amount: number; label: string };
  /** What stays in the middle, what it is called and whether it has been said yet. */
  kept: { amount: number; sign?: string; label: string; said?: boolean };
  /** What stands in the middle, written inside its ring. */
  mark: string;
  words: Line[];
  /** Seconds until the words under the drawing come. */
  wordsAt: number;
}

function Passage({ shown, side, top, tone, head, sent, arrives, kept, mark, words, wordsAt }: PassageProps) {
  const ink = INKS[tone];
  const left = side === "left" ? -CLEAR - WIDTH : CLEAR;
  const right = left + WIDTH;
  const anchor = side === "left" ? "end" : "start";
  const edge = side === "left" ? right : left;
  const road = top + 153;
  const from = left + (sent.amount >= 100 ? 105 : 80);
  const to = right - 82;
  const middle = (left + right) / 2 + 3;
  const taking = shown && (kept.said ?? true);
  // Said later than the rest, it comes at once; with the rest, when the amount passes by.
  const takeAt = kept.said === undefined ? AT.take : 0.1;
  const drawn = useDraw(to - from, shown, { delay: AT.road, duration: 0.8 });
  const drop = useDraw(DROP, taking, { delay: takeAt, duration: 0.5 });
  return (
    <g pointerEvents="none">
      <Rise shown={shown} delay={AT.head}>
        <Lines lines={head} x={edge} y={top} anchor={anchor} rows="top" />
      </Rise>

      {/* What sets off, on the left; what gets there, on the right. */}
      <Rise shown={shown} delay={AT.sent}>
        <text x={left} y={road + 20} className="display fill-ink tabular-nums" style={{ fontSize: 60 }}>
          {sent.amount}
        </text>
        <text x={left} y={road + 62} className="eyebrow fill-muted" style={{ fontSize: 24 }}>
          {sent.label}
        </text>
      </Rise>
      <Rise shown={shown} delay={AT.arrive}>
        <text x={right} y={road + 20} textAnchor="end" className="display fill-ink tabular-nums" style={{ fontSize: 60 }}>
          <Count from={sent.amount} to={arrives.amount} counting={shown} delay={AT.arrive + 0.2} />
        </text>
        <text x={right} y={road + 62} textAnchor="end" className="eyebrow fill-muted" style={{ fontSize: 24 }}>
          {arrives.label}
        </text>
      </Rise>

      <motion.path
        d={`M ${from} ${road} L ${to} ${road}`}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        className="stroke-ink"
        style={drawn.style}
      />
      <g transform={`translate(${to} ${road})`}>
        <Arrowhead tone="neutral" half={8} progress={drawn.progress} />
      </g>
      {/* The amount, on its way. */}
      <motion.circle
        cy={road}
        r={9}
        className="fill-ink"
        initial={false}
        animate={shown ? { cx: [from, to - 14], opacity: [0, 1, 1, 0] } : { cx: from, opacity: 0 }}
        transition={{ duration: shown ? 1.3 : 0, delay: shown ? AT.travel : 0, ease: "easeInOut", opacity: { times: [0, 0.1, 0.85, 1] } }}
      />

      {/* The part that stays in the middle. */}
      <motion.path
        d={`M ${middle} ${road + NODE + 6} L ${middle} ${road + NODE + 6 + DROP}`}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        className={ink.stroke}
        style={drop.style}
      />
      <g transform={`translate(${middle} ${road + NODE + 6 + DROP}) rotate(90)`}>
        <Arrowhead tone={tone} half={8} progress={drop.progress} />
      </g>
      <Rise shown={taking} delay={takeAt + 0.25}>
        <text
          x={middle}
          y={road + NODE + DROP + 68}
          textAnchor="middle"
          className={`display tabular-nums ${ink.deep}`}
          style={{ fontSize: 52 }}
        >
          <Count from={0} to={kept.amount} counting={taking} delay={takeAt + 0.3} sign={kept.amount === 0 ? "" : kept.sign} />
        </text>
        <text x={middle} y={road + NODE + DROP + 104} textAnchor="middle" className={`eyebrow ${ink.deep}`} style={{ fontSize: 24 }}>
          {kept.label}
        </text>
      </Rise>

      {/* What stands in the middle: it beats when the amount gets to it, and again when what it keeps is said. */}
      <g transform={`translate(${middle} ${road})`}>
        <motion.g
          initial={false}
          animate={taking ? { scale: [1, 1.22, 1] } : { scale: 1 }}
          transition={{ duration: 0.6, delay: taking ? Math.max(0, takeAt - 0.15) : 0, ease: EASE }}
        >
          <motion.circle
            r={NODE}
            className={ink.soft}
            initial={false}
            animate={{ scale: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 20, delay: shown ? AT.node : 0 }}
          />
          <Ring r={NODE} drawn={shown} delay={AT.node} strokeWidth={3} className={ink.stroke} />
          <Rise shown={shown} delay={AT.node + 0.3}>
            <text
              y={mark.length > 1 ? 8 : 10}
              textAnchor="middle"
              className={`font-medium ${ink.deep} ${mark.length > 1 ? "font-mono" : ""}`}
              style={{ fontSize: mark.length > 1 ? 22 : 28 }}
            >
              {mark}
            </text>
          </Rise>
        </motion.g>
      </g>

      <Rise shown={shown} delay={wordsAt}>
        <Lines lines={words} x={edge} y={top + 368} anchor={anchor} rows="top" />
      </Rise>
    </g>
  );
}

/** Today: what a business is owed passes through someone, who keeps a part. */
export function Middleman({ shown }: { shown: boolean }) {
  return (
    <Passage
      shown={shown}
      side="left"
      top={-262}
      tone="debt"
      head={[
        { text: "Hoy", kind: "kicker" },
        { text: "Alguien en el medio", kind: "title" },
      ]}
      sent={{ amount: 100, label: "Te deben" }}
      arrives={{ amount: 96, label: "Recibes" }}
      kept={{ amount: 4, sign: "−", label: "Comisión" }}
      mark="%"
      words={[
        { text: "Un factoring te adelanta la factura" },
        { text: "y cobra entre 1 % y 2,2 % cada mes." },
        { text: <tspan className="fill-debt-deep font-medium">A 53 días, hasta 4 de cada 100.</tspan>, gap: 12 },
        { text: "Costo del factoring: Pauta, julio 2026", kind: "source", gap: 8 },
      ]}
      wordsAt={3.1}
    />
  );
}

/** Words that wait for the voice to get to them, in the place they already have. */
function Said({ said, children }: { said: boolean; children: string }) {
  return (
    <motion.tspan initial={false} animate={{ fillOpacity: said ? 1 : 0 }} transition={{ duration: 0.6, ease: EASE }}>
      {children}
    </motion.tspan>
  );
}

/**
 * On Stellar: the same passage with a contract in the middle, which keeps
 * nothing. `step` is how far the voice has got since it started on why it
 * takes Stellar; each line comes as the voice gets to it, and says what the
 * voice leaves out.
 */
export function Contract({ shown, step }: { shown: boolean; step: number }) {
  return (
    <Passage
      shown={shown}
      side="right"
      top={-300}
      tone="free"
      head={[
        { text: "En Stellar", kind: "kicker" },
        { text: "Nadie en el medio", kind: "title" },
      ]}
      sent={{ amount: 20, label: "Pagan" }}
      arrives={{ amount: 20, label: "Reciben" }}
      kept={{ amount: 0, label: "Se queda", said: step >= 5 }}
      mark="{ }"
      words={[
        { text: "En el medio hay un smart contract" },
        { text: "(Soroban): código abierto." },
        { text: <Said said={step >= 3}>Cada negocio firma con su huella.</Said>, gap: 12 },
        { text: <Said said={step >= 4}>Todo o nada: si falta una firma,</Said>, kind: "label", gap: 12 },
        { text: <Said said={step >= 4}>no se mueve nada.</Said>, kind: "label" },
        { text: <Said said={step >= 5}>Nadie retiene tu plata.</Said>, gap: 12 },
        { text: <Said said={step >= 6}>El recibo es público para todos.</Said>, gap: 12 },
      ]}
      wordsAt={1.2}
    />
  );
}
