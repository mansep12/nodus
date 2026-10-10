"use client";

import { motion } from "motion/react";
import { Pin, type Point } from "./camera";
import { Cord, Dot, Note, line, type CordTone } from "./drawing";
import { position } from "./scenes";
import { PLACES, RING } from "./triangle";

/*
 * The web round the three. It grows from one business, the bakery: to one
 * side those it owes, to the other those who owe it; each of those opens the
 * same way, and the ones that appear open again, until the three are lost
 * in it and nobody can see, from their own business, the circle they are
 * in. Every cord has a direction: who owes whom. It is always there, faint,
 * so that every shot shows there is more world round what it looks at. In
 * La red it lights up wave by wave as the voice says it, and once the circle
 * is found it goes faint again.
 */

/** The radius of the three, which their cords leave from. */
const THREE = 46;
const [BAKERY, MILL, CARRIER] = [0, 1, 2];

/** By how far from the bakery a business is, in steps: how large it is, and how far from the one it grew from. */
const SIZE = [THREE, 22, 18, 15, 13, 12];
const REACH = [0, 290, 250, 225, 210, 200];
/** The web is wider than it is tall, as the frame is: nothing grows further up or down than this from the middle. */
const TALL = 780;
/** No two businesses are nearer than this. */
const APART = 115;
const NONE = -1;
const grown = (index: number) => index !== NONE;

/** A small, fixed sequence of numbers, so that the web is the same every time it is drawn. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const jitter = random(11);
const wobble = (amount: number) => (jitter() - 0.5) * amount;
const toward = (from: Point, angle: number, distance: number): Point => ({
  x: from.x + distance * Math.cos(angle),
  y: from.y + distance * Math.sin(angle),
});
const apart = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

interface Business {
  at: Point;
  /** The way it was reached, which is the way it opens. */
  angle: number;
  /** How many steps from the bakery. */
  generation: number;
  /** The wave it comes in with, and how long into it. */
  wave: number;
  delay: number;
}

interface Debt {
  /** Who owes, and to whom. */
  from: number;
  to: number;
  wave: number;
  delay: number;
  /** Seen from the bakery while the web is only its own: what it owes, or what it is owed. */
  tone?: CordTone;
}

/** The mill and the carrier are a step from the bakery already: it owes the one and is owed by the other. */
const BUSINESSES: Business[] = PLACES.map((place, index) => ({ ...place, generation: index === BAKERY ? 0 : 1, wave: 0, delay: 0 }));
const DEBTS: Debt[] = [];
/** Which business each one grew from, and the debt between the two. */
const GREW = new Map<number, { parent: number; debt: number }>();

/** A few businesses out toward the ring of twenty, so that the way there is not empty. They are there before the web, which grows round them. */
const BRIDGE: Point[] = [
  { x: 1380, y: -380 },
  { x: 1560, y: -560 },
  { x: 1500, y: 60 },
  { x: 1420, y: 640 },
  { x: 1620, y: 420 },
];
const LAST = 5;
/** The way to the twenty is only ever there faint, behind: it is not part of what lights up. */
const BEYOND = LAST + 1;
const BRIDGE_START = BUSINESSES.length;
BRIDGE.forEach((at) => BUSINESSES.push({ at, angle: 0, generation: 4, wave: BEYOND, delay: 0 }));

/**
 * A new business beside `parent`, out from the middle of the world and as
 * far as it can be from every other: the best of the directions round the
 * one its parent was reached in, or the given one.
 */
function grow(parent: number, wave: number, delay: number, owes: boolean, tone?: CordTone, angle?: number) {
  const from = BUSINESSES[parent]!;
  const generation = from.generation + 1;
  const distance = REACH[generation]! + wobble(50);
  const candidates = angle !== undefined ? [angle] : [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((turn) => from.angle + turn * 0.24);
  const clear = (at: Point) => Math.min(...BUSINESSES.map((other) => apart(other.at, at)));
  const room = (candidate: number) => {
    const at = toward(from.at, candidate, distance);
    // Growing back toward the middle would tangle the three themselves.
    if (Math.hypot(at.x, at.y) < Math.hypot(from.at.x, from.at.y) + 50) return -Infinity;
    // Sideways is where there is room in the frame; too far up or down there is less and less.
    return clear(at) * (1 + 0.3 * Math.abs(Math.cos(candidate))) - Math.max(0, Math.abs(at.y) - TALL) * 6;
  };
  const best = candidates.reduce((a, b) => (room(b) > room(a) ? b : a));
  const at = toward(from.at, best, distance);
  // Where there is no room left for one more, it does not grow.
  if (angle === undefined && (room(best) === -Infinity || clear(at) < APART || Math.abs(at.y) > TALL + 60)) return NONE;
  BUSINESSES.push({ at, angle: best, generation, wave, delay: delay + 0.35 });
  const child = BUSINESSES.length - 1;
  DEBTS.push(owes ? { from: parent, to: child, wave, delay, tone } : { from: child, to: parent, wave, delay, tone });
  GREW.set(child, { parent, debt: DEBTS.length - 1 });
  return child;
}

const degrees = (value: number) => (value * Math.PI) / 180;

// Wave 1: those the bakery owes, to its left, where the mill is. Wave 2: those who owe it, to its right, where the carrier is.
const OWED_BY_BAKERY = [128, 164].map((angle, index) => grow(BAKERY, 1, 0.1 + index * 0.4, true, "debt", degrees(angle)));
const OWING_BAKERY = [52, 16].map((angle, index) => grow(BAKERY, 2, 0.1 + index * 0.4, false, "credit", degrees(angle)));

// Wave 3: each of those, and the mill and the carrier, has its own: some it owes, some that owe it.
const SECOND: number[] = [];
[MILL, CARRIER, ...OWED_BY_BAKERY, ...OWING_BAKERY].forEach((parent, order) => {
  const count = parent === MILL || parent === CARRIER ? 3 : 2;
  for (let index = 0; index < count; index++) {
    const child = grow(parent, 3, SECOND.length * 0.11, (index + order) % 2 === 0);
    if (grown(child)) SECOND.push(child);
  }
});

// Wave 4: and those, others again.
const THIRD: number[] = [];
SECOND.forEach((parent, order) => {
  for (let index = 0; index < (order % 3 === 0 ? 2 : 1); index++) {
    const child = grow(parent, 4, THIRD.length * 0.08, (index + order) % 2 === 1);
    if (grown(child)) THIRD.push(child);
  }
});

// The last wave: one more round, further out, where the web is too large to follow.
const FOURTH = THIRD.flatMap((parent, order) =>
  (order % 2 ? [0] : [0, 1]).map((index) => grow(parent, LAST, 0.2 + order * 0.07 + index * 0.2, (index + order) % 2 === 0)),
).filter(grown);
const FIFTH = FOURTH.filter((_, order) => order % 3 !== 2)
  .map((parent, order) => grow(parent, LAST, 1.3 + order * 0.06, order % 2 === 1))
  .filter(grown);

// Out toward the twenty, from whichever of the web is nearest.
BRIDGE.forEach((at, index) => {
  const bridge = BRIDGE_START + index;
  const nearest = [...FOURTH, ...FIFTH].reduce((a, b) => (apart(BUSINESSES[b]!.at, at) < apart(BUSINESSES[a]!.at, at) ? b : a));
  DEBTS.push(index % 2 ? { from: bridge, to: nearest, wave: BEYOND, delay: 0 } : { from: nearest, to: bridge, wave: BEYOND, delay: 0 });
});
DEBTS.push(
  { from: BRIDGE_START, to: BRIDGE_START + 1, wave: BEYOND, delay: 0 },
  { from: BRIDGE_START + 4, to: BRIDGE_START + 3, wave: BEYOND, delay: 0 },
);

/**
 * And across: neighbours that grew from different businesses and deal with
 * each other. These are what closes circles in the web. The nearest pairs,
 * one crossing for each business at most, as soon as both are there.
 */
const linked = (a: number, b: number) => DEBTS.some((debt) => (debt.from === a && debt.to === b) || (debt.from === b && debt.to === a));
const crossings = [...SECOND, ...THIRD, ...FOURTH, ...FIFTH]
  .flatMap((a, index, all) => all.slice(index + 1).map((b) => [a, b] as const))
  .filter(([a, b]) => !linked(a, b) && apart(BUSINESSES[a]!.at, BUSINESSES[b]!.at) < 330)
  .sort(([a, b], [c, d]) => apart(BUSINESSES[a]!.at, BUSINESSES[b]!.at) - apart(BUSINESSES[c]!.at, BUSINESSES[d]!.at));
const crossed = new Set<number>();
const CROSSINGS: number[] = [];
for (const [a, b] of crossings) {
  if (crossed.has(a) || crossed.has(b) || crossed.size >= 48) continue;
  crossed.add(a).add(b);
  const wave = Math.max(BUSINESSES[a]!.wave, BUSINESSES[b]!.wave);
  DEBTS.push({ ...((a + b) % 2 ? { from: a, to: b } : { from: b, to: a }), wave, delay: 1 + (crossed.size / 48) * 1.6 });
  CROSSINGS.push(DEBTS.length - 1);
}

/** The way up from a business to the three, one business at a time. */
function ancestry(index: number) {
  const path = [index];
  while (GREW.has(path.at(-1)!)) path.push(GREW.get(path.at(-1)!)!.parent);
  return path;
}

/**
 * The circles there are in the web besides the one of the three: where a
 * crossing joins two businesses that grew from the same one, the debts from
 * that one down to the first, across, and back up from the second go round.
 * A few of them, small and far from each other, with their debts turned so
 * that they do go round: those are what Nodus finds.
 */
interface Circle {
  businesses: number[];
  debts: number[];
  middle: Point;
}
const CIRCLES: Circle[] = [];
const candidates = CROSSINGS.flatMap((crossing) => {
  const { from: a, to: b } = DEBTS[crossing]!;
  const [up, other] = [ancestry(a), ancestry(b)];
  const top = up.find((index) => other.includes(index));
  // Through the three, it would be their circle, not another.
  if (top === undefined || top < PLACES.length) return [];
  const [down, back] = [up.slice(0, up.indexOf(top)), other.slice(0, other.indexOf(top))];
  return [{ crossing, top, down, back, size: down.length + back.length + 1 }];
}).sort((a, b) => a.size - b.size);
/** How round a circle of businesses is, from 0 (flat) to 1: flat ones do not read as circles. */
function roundness(points: Point[]) {
  const next = (index: number) => points[(index + 1) % points.length]!;
  const area = Math.abs(points.reduce((sum, point, index) => sum + point.x * next(index).y - next(index).x * point.y, 0)) / 2;
  const around = points.reduce((sum, point, index) => sum + apart(point, next(index)), 0);
  return (4 * Math.PI * area) / around ** 2;
}
for (const { crossing, top, down, back, size } of candidates) {
  if (size < 3 || size > 6 || CIRCLES.length >= 4) continue;
  const businesses = [top, ...[...down].reverse(), ...back];
  const points = businesses.map((index) => BUSINESSES[index]!.at);
  const middle = { x: points.reduce((sum, point) => sum + point.x, 0) / size, y: points.reduce((sum, point) => sum + point.y, 0) / size };
  // Round, clear of the three, and far from the ones already chosen.
  if (roundness(points) < 0.5 || Math.hypot(middle.x, middle.y) < 480) continue;
  if (CIRCLES.some((circle) => apart(circle.middle, middle) < 560 || circle.businesses.some((index) => businesses.includes(index))))
    continue;
  // Down from the top to the one, across to the other, and back up.
  for (const index of down) {
    const { parent, debt } = GREW.get(index)!;
    DEBTS[debt] = { ...DEBTS[debt]!, from: parent, to: index };
  }
  for (const index of back) {
    const { parent, debt } = GREW.get(index)!;
    DEBTS[debt] = { ...DEBTS[debt]!, from: index, to: parent };
  }
  CIRCLES.push({
    businesses,
    debts: [...down.map((index) => GREW.get(index)!.debt), crossing, ...back.map((index) => GREW.get(index)!.debt)],
    middle,
  });
}

/** What the web covers, without the way to the twenty, for the camera that has to hold all of it. */
const covered = BUSINESSES.filter((_, index) => index < BRIDGE_START || index >= BRIDGE_START + BRIDGE.length).map(
  (business) => business.at,
);
export const WEB_BOUNDS = {
  left: Math.min(...covered.map((at) => at.x)),
  right: Math.max(...covered.map((at) => at.x)),
  top: Math.min(...covered.map((at) => at.y)),
  bottom: Math.max(...covered.map((at) => at.y)),
};

/** The web once: every debt and business that has come by `wave` (0 draws nothing). With `own`, the bakery's debts are in its own inks; `lit`, the rest is in ink rather than in grey; `alone`, the rest all but goes out. */
function Layer({
  wave,
  own = false,
  alone = false,
  lit = false,
  width,
}: {
  wave: number;
  own?: boolean;
  alone?: boolean;
  lit?: boolean;
  width: number;
}) {
  return (
    <>
      {DEBTS.map((debt, index) => {
        const [from, to] = [BUSINESSES[debt.from]!, BUSINESSES[debt.to]!];
        const shape = line(from.at, to.at, SIZE[from.generation]! + 6, SIZE[to.generation]! + 10);
        const inked = own && debt.tone;
        return (
          // Lit, the web is in ink, dimmed so that it stays behind the three; the bakery's own debts are in full colour.
          <g key={index} className="transition-opacity duration-700" style={{ opacity: inked || !lit ? 1 : alone ? 0.1 : 0.42 }}>
            <Cord
              d={shape.d}
              length={shape.length}
              head={shape.head}
              width={width}
              tone={inked ? debt.tone : lit ? "ink" : "neutral"}
              drawn={wave >= debt.wave}
              delay={debt.delay}
              duration={0.7}
            />
          </g>
        );
      })}
      {BUSINESSES.slice(PLACES.length).map((business, index) => (
        <Dot key={index} at={business.at} r={SIZE[business.generation]!} shown={wave >= business.wave} delay={business.delay} />
      ))}
    </>
  );
}

export function Web({ g }: { g: number }) {
  const p = position;
  // In La red the web lights up over its faint self, a wave at each step, until the circle is lit.
  const growing = g >= p("red", 1) && g < p("demo");
  const lighting = g >= p("red", 1) && g < p("red", 8);
  const wave = growing ? Math.min(LAST, g - p("red")) : 0;
  // While it is only the bakery's, its debts are in its inks: what it owes, and what it is owed.
  const alone = g === p("red", 6);
  const own = g < p("red", 3) || alone;
  // Nodus sees what nobody else can: the circles there are in the web, drawn over it, then marked as found.
  const circling = g >= p("red", 8) && g < p("demo");
  const found = g >= p("red", 9);
  const beside = (index: number) => BUSINESSES[index]!.at;

  return (
    <g pointerEvents="none">
      <motion.g
        initial={false}
        animate={{ opacity: g >= p("cierre") || g <= p("problema", 1) ? 0.9 : 0.18 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        <Layer wave={BEYOND} width={2.5} />
      </motion.g>
      <motion.g initial={false} animate={{ opacity: lighting ? 1 : 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
        <Layer wave={wave} own={own} alone={alone} lit width={3.5} />
      </motion.g>

      <motion.g initial={false} animate={{ opacity: circling ? 1 : 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
        {CIRCLES.flatMap((circle, order) =>
          circle.debts.map((index, step) => {
            const debt = DEBTS[index]!;
            const [from, to] = [BUSINESSES[debt.from]!, BUSINESSES[debt.to]!];
            const shape = line(from.at, to.at, SIZE[from.generation]! + 6, SIZE[to.generation]! + 10);
            return (
              <Cord
                key={index}
                d={shape.d}
                length={shape.length}
                head={shape.head}
                width={6}
                tone={found ? "free" : "ink"}
                drawn={circling}
                delay={0.2 + order * 0.15 + step * 0.12}
                duration={0.6}
              />
            );
          }),
        )}
        {CIRCLES.flatMap((circle) =>
          circle.businesses.map((index) => (
            <Dot key={index} at={BUSINESSES[index]!.at} r={SIZE[BUSINESSES[index]!.generation]!} shown={circling} done={found} />
          )),
        )}
      </motion.g>

      <Pin {...beside(OWED_BY_BAKERY[1]!)}>
        <Note
          shown={g >= p("red", 1) && g < p("red", 3)}
          to={{ x: -50, y: 40 }}
          clear={SIZE[1]! + 6}
          anchor="end"
          rows="top"
          delay={0.7}
          lines={[{ text: <tspan className="fill-debt-deep">Les debe</tspan>, kind: "label" }]}
        />
      </Pin>
      <Pin {...beside(OWING_BAKERY[1]!)}>
        <Note
          shown={g >= p("red", 2) && g < p("red", 3)}
          to={{ x: 50, y: 40 }}
          clear={SIZE[1]! + 6}
          anchor="start"
          rows="top"
          delay={0.7}
          lines={[{ text: <tspan className="fill-credit-deep">Le deben</tspan>, kind: "label" }]}
        />
      </Pin>
      <Pin x={0} y={RING}>
        <Note
          shown={found && circling}
          to={{ x: 0, y: 96 }}
          leader={false}
          anchor="middle"
          rows="top"
          delay={0.4}
          lines={[{ text: <tspan className="fill-free-deep">Nodus los encuentra.</tspan>, kind: "title" }]}
        />
      </Pin>
    </g>
  );
}
