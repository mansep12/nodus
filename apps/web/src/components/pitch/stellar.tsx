"use client";

import { AnimatePresence, motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { INK } from "@/lib/tones";
import type { CircleView } from "@/lib/types";
import { CircleGraph } from "../circle-graph";
import { TRANSACTIONS } from "../landing/facts";
import { Pin, type Point } from "./camera";
import { useLocal } from "./clock";
import { Glow, Note, type Line } from "./drawing";
import { Contract, Middleman } from "./middleman";
import { position } from "./scenes";
import { timeOf } from "./timeline";

/*
 * Off to the side of the world, the circle of twenty: every signature
 * travelling on to the next, settled in one transaction. Beside it, the
 * receipt, and then why it takes Stellar: how it is done today, with
 * someone in the middle, and how it is done here, with nobody, each a
 * column drawn out from the ring as the voice gets to it.
 */

/** Where the ring of twenty is in the world, and how wide its drawing is. */
export const TWENTY: Point = { x: 2000, y: 0 };
const SIZE = 1000;
/** `CircleGraph` draws twenty on a ring of 240 in a square of 568 when it writes no names. */
const RADIUS = (240 / 568) * SIZE;
const onRing = (degrees: number, out = 0): Point => ({
  x: TWENTY.x + (RADIUS + out) * Math.cos((degrees * Math.PI) / 180),
  y: TWENTY.y + (RADIUS + out) * Math.sin((degrees * Math.PI) / 180),
});

/** The ring is seen far smaller than in the app: its words are drawn larger to read at 24 px or more in the frame. */
const TEXT_SCALE = 1.75;

const UNIT = 10_000_000;
const COUNT = 20;
/** Round amounts, one per debt, so that the ring reads as businesses and not as a chart. */
const AMOUNTS = [120, 90, 150, 80, 200, 60, 110, 95, 130, 70, 180, 85, 140, 100, 75, 160, 90, 125, 105, 115];
const ADDRESSES = Array.from({ length: COUNT }, (_, index) => `negocio-${index}`);
const ME = ADDRESSES[0]!;
const NAMES: Record<string, string> = { [ME]: "Panadería Sur", [ADDRESSES[1]!]: "Molino Andes", [ADDRESSES[COUNT - 1]!]: "Fletes Ruta 5" };
const nameOf = (address: string) => NAMES[address] ?? "";

/**
 * The order the twenty sign in: shuffled, but the same every time (a fixed
 * seed), and the business looking last, so that its signature is the one
 * that ties the knot.
 */
const ORDER = (() => {
  let seed = 2026;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const others = Array.from({ length: COUNT - 1 }, (_, index) => index + 1);
  for (let index = others.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [others[index], others[swap]] = [others[swap]!, others[index]!];
  }
  return [...others, 0];
})();
/** Where each party comes in that order. */
const RANK = ADDRESSES.map((_, index) => ORDER.indexOf(index));

/** The circle with the first `signed` signatures of the order in. */
function circleOf(signed: number, settled: boolean): CircleView {
  const parties = ADDRESSES.map((address, index) => {
    const owes = AMOUNTS[index]!;
    const owed = AMOUNTS[(index + COUNT - 1) % COUNT]!;
    const order = RANK[index]!;
    return {
      address,
      known: index === 0 || index === 1 || index === COUNT - 1,
      owesLess: String(owes * UNIT),
      owedLess: String(owed * UNIT),
      net: String((owed - owes) * UNIT),
      signed: settled || order < signed,
    };
  });
  const cleared = AMOUNTS.reduce((sum, amount) => sum + amount, 0);
  const moved = parties.reduce((sum, party) => sum + Math.max(0, Number(party.net) / UNIT), 0);
  return {
    key: "veinte",
    clearings: [],
    parties,
    edges: ADDRESSES.map((address, index) => ({
      from: address,
      to: ADDRESSES[(index + 1) % COUNT]!,
      amount: String(AMOUNTS[index]! * UNIT),
    })),
    cleared: String(cleared * UNIT),
    moved: String(moved * UNIT),
    proposal: { id: "veinte", status: settled ? "settled" : "open", expirationLedger: 0 },
  };
}

/**
 * How the signatures come in: the first a moment after the step, and the
 * rest spread over the time the voice leaves before the next one, so that
 * the last lands a second before it, one every 120 to 300 ms.
 */
const SIGNING = { first: 0.1, margin: 0.25, fastest: 0.05, slowest: 0.3, unvoiced: 0.12 };

function signingPace(): number {
  const [from, to] = [timeOf("veinte", 1), timeOf("veinte", 2)];
  if (from === undefined || to === undefined) return SIGNING.unvoiced;
  return Math.min(SIGNING.slowest, Math.max(SIGNING.fastest, (to - from - SIGNING.first - SIGNING.margin) / (COUNT - 1)));
}
const PACE = signingPace();

/** The ring itself: signed, tied and untied on the clock, as the steps say. */
function Ring({ signing, settled, summary }: { signing: boolean; settled: boolean; summary: boolean }) {
  const signed = useLocal((local) => {
    const from = signing ? timeOf("veinte", 1, local) : undefined;
    return from === undefined ? 0 : Math.max(0, Math.min(COUNT, Math.floor((local - from - SIGNING.first) / PACE) + 1));
  });
  const circle = circleOf(signed, settled);
  return (
    <>
      <foreignObject x={TWENTY.x - SIZE / 2} y={TWENTY.y - SIZE / 2} width={SIZE} height={SIZE}>
        <div className="size-full [&_svg]:max-w-none">
          <CircleGraph circle={circle} me={ME} nameOf={nameOf} labels={false} summary={false} textScale={TEXT_SCALE} />
        </div>
      </foreignObject>
      <Pin {...TWENTY}>
        <motion.g animate={{ opacity: summary ? 1 : 0 }} transition={{ duration: 0.5 }}>
          <text y={-65} textAnchor="middle" className="fill-muted" style={{ fontSize: 25, letterSpacing: 3 }}>
            {settled ? "TODAS LAS FIRMAS JUNTAS" : "VEINTE NEGOCIOS"}
          </text>
          <text y={42} textAnchor="middle" className={`display ${settled ? "fill-free" : "fill-ink"}`} style={{ fontSize: 124 }}>
            {settled ? "1" : signing ? signed : "20"}
          </text>
          <text y={96} textAnchor="middle" className="fill-muted" style={{ fontSize: 32 }}>
            {settled ? "sola transacción" : signing ? "de 20 firmas" : "en un círculo"}
          </text>
        </motion.g>
      </Pin>
    </>
  );
}

const RECEIPT: Line[] = [
  { text: "Red de pruebas de Stellar", kind: "kicker" },
  { text: TRANSACTIONS.twenty.title, kind: "title" },
  { text: TRANSACTIONS.twenty.hash.slice(0, 32), kind: "mono", gap: 8 },
  { text: TRANSACTIONS.twenty.hash.slice(32), kind: "mono" },
  ...[
    ["20", "firmas de passkey"],
    ["33 %", "del cómputo que permite la red"],
    ["44 %", "del tamaño que permite la red"],
  ].map(([figure, label], index): Line => ({
    text: (
      <>
        <tspan className="display fill-ink" style={{ fontSize: 52 }}>
          {figure}
        </tspan>
        <tspan dx={14}>{label}</tspan>
      </>
    ),
    gap: index === 0 ? 34 : 26,
  })),
  { text: "stellar.expert/explorer/testnet", kind: "mono", gap: 18 },
];

export function Twenty({ g }: { g: number }) {
  const p = position;
  const arrived = g >= p("veinte");
  // The ring draws itself while the camera travels to it, so that the trip is never empty.
  // At the closing it leaves: the name and its line are written where it would show through.
  const drawn = arrived && g < p("cierre");
  const settled = g >= p("veinte", 2);
  const ours = g >= p("veinte") && g < p("cierre");

  return (
    <g pointerEvents="none">
      <Glow at={TWENTY} size={1500} color={settled ? INK.free.bloom : INK.credit.bloom} className="opacity-60" />
      {/* It stays while it fades, so that going back past it does not take it away at once. */}
      <AnimatePresence>
        {drawn && (
          <motion.g
            key="ring"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <Ring signing={g === p("veinte", 1)} settled={settled} summary={ours} />
          </motion.g>
        )}
      </AnimatePresence>

      <Pin {...onRing(220)}>
        <Note
          shown={g >= p("veinte") && g < p("veinte", 3)}
          to={{ x: -80, y: -80 }}
          anchor="end"
          rows="bottom"
          delay={1.4}
          lines={[{ text: "Veinte negocios.", kind: "label" }]}
        />
      </Pin>
      <Pin {...onRing(160)}>
        <Note
          shown={g === p("veinte", 1)}
          to={{ x: -90, y: 50 }}
          anchor="end"
          rows="top"
          lines={[{ text: "Cada uno firma solo su parte." }]}
        />
        <Note
          shown={g === p("veinte", 2)}
          to={{ x: -90, y: 50 }}
          anchor="end"
          rows="top"
          lines={[{ text: "Con la última firma," }, { text: "una sola transacción." }]}
        />
      </Pin>
      <Pin {...onRing(0)}>
        <Note shown={g === p("veinte", 3)} to={{ x: 110, y: 0 }} anchor="start" rows="middle" delay={0.3} lines={RECEIPT} />
      </Pin>

      <Pin {...onRing(270)}>
        <Note
          shown={ours && g >= p("stellar")}
          to={{ x: 0, y: -60 }}
          leader={false}
          anchor="middle"
          rows="bottom"
          delay={0.6}
          lines={[
            { text: "Por qué Stellar", kind: "kicker" },
            { text: "Hoy siempre hay alguien en el medio.", kind: "label" },
          ]}
        />
      </Pin>
      <Pin {...onRing(180)}>
        <Middleman shown={ours && g >= p("stellar", 1)} />
      </Pin>
      <Pin {...onRing(0)}>
        <Contract shown={ours && g >= p("stellar", 2)} step={g - p("stellar")} />
      </Pin>
    </g>
  );
}
