"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { clip, formatAmount, initials } from "@/lib/format";
import { EASE, UNTYING } from "@/lib/motion";
import { INK } from "@/lib/tones";
import type { CircleView } from "@/lib/types";
import { useDraw } from "./cord";
import { KNOT, KNOT_STRAND } from "./ui";

// Wider than tall: names are written beside the nodes at the sides.
const WIDTH = 660;
const HEIGHT = 440;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RING = 136;
/** Side of the square that fits the ring alone, without names. */
const COMPACT = 2 * (RING + 44);
const MIN_CORD = 3;
const MAX_CORD = 9;

/** How large each kind of party is drawn. */
const RADIUS = { me: 28, known: 22, unknown: 10 };

/**
 * A group turns and grows about the middle of what it holds. This holds
 * nothing to see and keeps that middle on the middle of the ring, whatever
 * else is in the group at the time.
 */
const ABOUT_CENTER = (
  <rect
    x={CENTER.x - RING - 24}
    y={CENTER.y - RING - 24}
    width={2 * (RING + 24)}
    height={2 * (RING + 24)}
    fill="none"
    pointerEvents="none"
  />
);

/** Where a circle is in being untied: its debts pulled tight into the knot, the knot letting go, or neither. */
export type Untying = "tight" | "loose" | null;

/**
 * Follows a circle through being untied, from the moment it is `settled`
 * while on screen. One that was settled already when it was first shown is
 * at rest, and so is everything for whoever asked for less motion.
 */
export function useUntying(settled: boolean): Untying {
  const still = useReducedMotion();
  const [was, setWas] = useState(settled);
  const [phase, setPhase] = useState<Untying>(null);
  if (was !== settled) {
    setWas(settled);
    setPhase(settled && !still ? "tight" : null);
  }
  useEffect(() => {
    if (phase === null) return;
    const next = setTimeout(() => setPhase(phase === "tight" ? "loose" : null), UNTYING[phase] * 1000);
    return () => clearTimeout(next);
  }, [phase]);
  return phase;
}

interface Props {
  circle: CircleView;
  me: string;
  nameOf: (address: string) => string;
  /** Whether to write each business's name beside its node. Without them the drawing is narrower. */
  labels?: boolean;
  /** Where the circle is in being untied, from `useUntying`. */
  untying?: Untying;
}

/** A signature on its way round the ring, from the party that just signed to the next one missing. */
interface Pass {
  id: string;
  from: number;
  to: number;
  /** How large the node it is going to is drawn. */
  reach: number;
}

const at = (angle: number, radius = RING) => ({ x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle) });

/**
 * The circle drawn as what it is: a ring, with every business a node on it
 * and every debt the stretch of ring to the business it is owed to. A business
 * sees itself at the bottom and, by name, only the two it deals with: the one
 * that owes it, in blue, and the one it owes, in red. The rest are unnamed
 * nodes that only tell whether they have signed. A signature travels on to
 * the next party missing, and when the circle is settled its debts are
 * pulled into a knot that lets go.
 */
export function CircleGraph({ circle, me, nameOf, labels = true, untying = null }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const still = useReducedMotion();
  const settled = circle.proposal?.status === "settled";
  const tight = untying === "tight";
  const { parties, edges } = circle;
  const count = parties.length;
  const mine = parties.findIndex((party) => party.address === me);

  // Only the viewer's own debts come with an amount; the rest of the ring is drawn without one.
  const owedByMe = new Map(edges.filter((edge) => edge.from === me).map((edge) => [edge.to, edge.amount ?? "0"]));
  const owedToMe = new Map(edges.filter((edge) => edge.to === me).map((edge) => [edge.from, edge.amount ?? "0"]));
  const kindOf = (address: string) => (address === me ? "me" : owedByMe.has(address) || owedToMe.has(address) ? "known" : "unknown");

  // The parties come in the order their debts chain, and go clockwise. The
  // one looking sits at the bottom; a circle seen from outside starts at the top.
  const anchor = mine === -1 ? { index: 0, angle: -Math.PI / 2 } : { index: mine, angle: Math.PI / 2 };
  const angleOf = new Map(parties.map((party, index) => [party.address, anchor.angle + ((index - anchor.index) * 2 * Math.PI) / count]));

  // The parties the viewer does not deal with come with a different marker on every read, so they are told apart by their place.
  const signatures = parties.map((party) => (party.signed ? "1" : "0")).join("");
  const [seen, setSeen] = useState(signatures);
  const [passes, setPasses] = useState<Pass[]>([]);
  if (seen !== signatures) {
    setSeen(signatures);
    const fresh = parties.flatMap((party, index): Pass[] => {
      if (still || settled || seen.length !== count || !party.signed || seen[index] === "1") return [];
      // Clockwise from the one that signed, the first that has not.
      const next = parties.findIndex((_, step) => step > 0 && !parties[(index + step) % count]!.signed);
      if (next === -1) return [];
      const to = parties[(index + next) % count]!;
      const from = angleOf.get(party.address)!;
      return [{ id: `${signatures}:${index}`, from, to: from + (next * 2 * Math.PI) / count, reach: RADIUS[kindOf(to.address)] }];
    });
    if (fresh.length > 0) setPasses((current) => [...current, ...fresh]);
  }
  const arrived = useCallback((id: string) => setPasses((current) => current.filter((pass) => pass.id !== id)), []);

  const largestOfMine = [...owedByMe.values(), ...owedToMe.values()].reduce(
    (max, amount) => (BigInt(amount) > max ? BigInt(amount) : max),
    0n,
  );

  const cords = edges.flatMap((edge) => {
    const [from, to] = [angleOf.get(edge.from), angleOf.get(edge.to)];
    if (from === undefined || to === undefined) return [];
    const tone = edge.from === me ? ("debt" as const) : edge.to === me ? ("credit" as const) : ("neutral" as const);
    // Each stretch stops short of the nodes at its ends.
    const start = from + (RADIUS[kindOf(edge.from)] + 7) / RING;
    let end = to - (RADIUS[kindOf(edge.to)] + 12) / RING;
    while (end < start) end += 2 * Math.PI;
    const [tail, head] = [at(start), at(end)];
    const share = tone === "neutral" || largestOfMine === 0n ? 0 : Math.sqrt(Number(BigInt(edge.amount ?? "0")) / Number(largestOfMine));
    return [
      {
        ...edge,
        tone,
        width: tone === "neutral" ? 1.75 : MIN_CORD + (MAX_CORD - MIN_CORD) * share,
        path: `M ${tail.x} ${tail.y} A ${RING} ${RING} 0 ${end - start > Math.PI ? 1 : 0} 1 ${head.x} ${head.y}`,
        length: RING * (end - start),
        // Going clockwise, the ring heads a quarter turn ahead of where it is.
        head: { ...head, heading: (end * 180) / Math.PI + 90 },
      },
    ];
  });

  return (
    <svg
      viewBox={labels ? `0 0 ${WIDTH} ${HEIGHT}` : `${CENTER.x - COMPACT / 2} ${CENTER.y - COMPACT / 2} ${COMPACT} ${COMPACT}`}
      className="w-full max-w-xl select-none"
      role="img"
      aria-label="Círculo de deudas"
    >
      {/* What is left of the ring once it lets go. */}
      <motion.circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={RING}
        fill="none"
        strokeWidth={1}
        strokeDasharray="2 6"
        className="stroke-free/50"
        initial={false}
        animate={settled && !tight ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.3 }}
        transition={{ duration: untying ? UNTYING.loose * 0.85 : 0, ease: EASE }}
      />

      {/* The ring and its debts, which settling pulls into the middle. Unsettled, they are back at once. */}
      <motion.g
        initial={false}
        animate={settled ? { opacity: 0, scale: 0.16, rotate: 150 } : { opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: tight ? UNTYING.tight * 0.6 : 0, ease: [0.5, 0, 0.3, 1] }}
      >
        {ABOUT_CENTER}
        <circle cx={CENTER.x} cy={CENTER.y} r={RING} fill="none" strokeWidth={1} className="stroke-hairline-strong" />
        {cords.map((cord, index) => (
          <Stretch
            key={index}
            {...cord}
            drawn={!settled || tight}
            delay={0.1 + index * 0.12}
            dimmed={hovered !== null && cord.from !== hovered && cord.to !== hovered}
          />
        ))}
      </motion.g>

      {untying && <Tie loose={untying === "loose"} />}

      {passes.map((pass) => (
        <Passing key={pass.id} {...pass} onArrival={arrived} />
      ))}

      <motion.g
        pointerEvents="none"
        initial={false}
        animate={{ opacity: tight ? 0 : 1 }}
        transition={{ duration: tight ? 0.3 : 0.6, delay: untying === "loose" ? 0.3 : 0 }}
      >
        <text x={CENTER.x} y={CENTER.y - 18} textAnchor="middle" className="eyebrow fill-muted !text-[10.5px]">
          {settled ? "se cancelaron" : "se cancelan"}
        </text>
        <text
          x={CENTER.x}
          y={CENTER.y + 16}
          textAnchor="middle"
          className={`display text-[40px] transition-colors duration-700 ${settled ? "fill-free" : "fill-ink"}`}
        >
          {formatAmount(circle.cleared)}
        </text>
        <text x={CENTER.x} y={CENTER.y + 38} textAnchor="middle" className="fill-muted text-[12.5px]">
          {circle.moved === "0" ? "sin mover dinero" : `moviendo ${formatAmount(circle.moved)}`}
        </text>
      </motion.g>

      {parties.map((party, index) => {
        const kind = kindOf(party.address);
        const angle = angleOf.get(party.address)!;
        const point = at(angle);
        const radius = RADIUS[kind];
        const done = settled || party.signed;
        const name = nameOf(party.address);
        const active = hovered === party.address;

        // Names go outside the ring, on the side their node is on.
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        const side = cos > 0.3 ? "right" : cos < -0.3 ? "left" : sin < 0 ? "above" : "below";
        const anchorText = side === "right" ? "start" : side === "left" ? "end" : "middle";
        const labelX = side === "right" ? radius + 12 : side === "left" ? -radius - 12 : 0;
        const labelY = side === "above" ? -radius - 26 : side === "below" ? radius + 22 : -3;

        const debts = [
          owedToMe.has(party.address) && `${settled ? "te debía" : "te debe"} ${formatAmount(owedToMe.get(party.address)!)}`,
          owedByMe.has(party.address) && `${settled ? "le debías" : "le debes"} ${formatAmount(owedByMe.get(party.address)!)}`,
        ].filter(Boolean);
        const caption =
          kind === "me"
            ? netInWords(BigInt(party.net), settled)
            : kind === "known"
              ? debts.join(" · ")
              : done
                ? "ya firmó"
                : "falta su firma";

        return (
          <g
            key={index}
            transform={`translate(${point.x} ${point.y})`}
            onPointerEnter={() => setHovered(party.address)}
            onPointerLeave={() => setHovered(null)}
          >
            <title>{kind === "unknown" ? `Otro negocio del círculo: ${caption}` : `${name}: ${caption}`}</title>
            <circle r={radius + 10} fill="transparent" />
            <motion.g animate={{ scale: active ? 1.1 : 1 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}>
              <circle
                r={radius}
                strokeWidth={kind === "unknown" ? 1.75 : 2.5}
                className={`transition-colors duration-500 ${kind === "me" ? "lift-high fill-ink" : "lift fill-card"} ${
                  done ? "stroke-free" : kind === "unknown" ? "stroke-muted" : "stroke-ink"
                }`}
              />
              {kind !== "unknown" && (
                <text
                  y={kind === "me" ? 5.5 : 4.5}
                  textAnchor="middle"
                  className={`font-semibold ${kind === "me" ? "fill-white text-body-sm" : "fill-ink text-[12.5px]"}`}
                >
                  {initials(name)}
                </text>
              )}
              {done && (
                // The mark of a signature: a tick, on the node's shoulder or filling a small one.
                <g transform={kind === "unknown" ? undefined : `translate(${radius * 0.72} ${-radius * 0.72})`}>
                  <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
                    <circle
                      r={kind === "unknown" ? radius - 2.5 : 9.5}
                      className="fill-free stroke-card"
                      strokeWidth={kind === "unknown" ? 0 : 2}
                    />
                    <path
                      d={kind === "unknown" ? "M -3 0.3 L -0.8 2.4 L 3 -2.2" : "M -4 0 L -1 3 L 4 -3"}
                      fill="none"
                      strokeWidth={kind === "unknown" ? 1.6 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-card"
                    />
                  </motion.g>
                </g>
              )}
            </motion.g>
            {labels && kind !== "unknown" && (
              <g pointerEvents="none">
                <text x={labelX} y={labelY} textAnchor={anchorText} className="fill-ink text-caption font-medium">
                  {clip(name, 22)}
                  {kind === "me" && " (tú)"}
                </text>
                <text x={labelX} y={labelY + 16} textAnchor={anchorText} className="fill-muted text-label tabular-nums">
                  {caption}
                </text>
              </g>
            )}
            {labels && kind === "unknown" && active && (
              <text
                x={labelX}
                y={labelY + (side === "above" ? 12 : side === "below" ? -2 : 7)}
                textAnchor={anchorText}
                className="fill-muted text-label"
                pointerEvents="none"
              >
                Otro negocio · {caption}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface StretchProps {
  path: string;
  length: number;
  width: number;
  /** Whose debt it is: the viewer's, one owed to the viewer, or neither. */
  tone: "debt" | "credit" | "neutral";
  /** Where it ends, and which way it is going there, in degrees. */
  head: { x: number; y: number; heading: number };
  drawn: boolean;
  delay: number;
  dimmed: boolean;
}

/** A debt: the stretch of ring from who owes it to whom, with an arrowhead that says which way. */
function Stretch({ path, length, width, tone, head, drawn, delay, dimmed }: StretchProps) {
  const draw = useDraw(length, drawn, { delay });
  // The arrowhead appears as the stretch gets to it.
  const arrival = useTransform(draw.progress, [0.7, 1], [0, 1]);
  // Wider than the stretch, so that it reads as an arrowhead and not as its end.
  const half = Math.max(5, width * 1.15);
  return (
    <motion.g animate={{ opacity: dimmed ? 0.3 : 1 }} transition={{ duration: 0.25 }}>
      <motion.path d={path} fill="none" strokeWidth={width} strokeLinecap="round" className={INK[tone].stroke} style={draw.style} />
      <g transform={`translate(${head.x} ${head.y}) rotate(${head.heading})`}>
        <motion.path
          d={`M ${-half * 0.8} ${-half} L ${half} 0 L ${-half * 0.8} ${half} z`}
          strokeWidth={1.5}
          strokeLinejoin="round"
          className={`${INK[tone].fill} ${INK[tone].stroke}`}
          style={{ opacity: arrival, scale: arrival }}
        />
      </g>
    </motion.g>
  );
}

/** How much larger than the logo the knot is drawn in the middle of the ring. */
const KNOT_SCALE = 4;
/** The middle of the knot in its own box, which is not the middle of the box. */
const KNOT_MIDDLE = { x: 16, y: 18.2 };

/** The knot the debts of a circle are pulled into, each strand drawn in turn, and taken back when it is `loose`. */
function Tie({ loose }: { loose: boolean }) {
  return (
    <motion.g
      pointerEvents="none"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={loose ? { opacity: 0, scale: 1.3 } : { opacity: 1, scale: 1 }}
      transition={{ duration: loose ? UNTYING.loose * 0.7 : 0.5, delay: loose ? 0 : 0.35, ease: EASE }}
    >
      {ABOUT_CENTER}
      <g
        transform={`translate(${CENTER.x - KNOT_MIDDLE.x * KNOT_SCALE} ${CENTER.y - KNOT_MIDDLE.y * KNOT_SCALE}) scale(${KNOT_SCALE})`}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="stroke-ink"
      >
        {KNOT.map((strand, index) => (
          <Strand key={strand.slice(0, 12)} d={strand} drawn={!loose} delay={0.4 + index * 0.14} />
        ))}
      </g>
    </motion.g>
  );
}

function Strand({ d, drawn, delay }: { d: string; drawn: boolean; delay: number }) {
  const draw = useDraw(KNOT_STRAND, drawn, { delay, duration: 0.6 });
  return <motion.path d={d} style={draw.style} />;
}

/** A bead that carries a signature round the ring, and a ring that opens where it gets to. */
function Passing({ id, from, to, reach, onArrival }: Pass & { onArrival: (id: string) => void }) {
  const progress = useMotionValue(0);
  useEffect(() => {
    const running = animate(progress, 1, {
      // A longer way round takes longer, but not in proportion.
      duration: Math.min(1.9, 0.7 + (to - from) / Math.PI),
      delay: 0.25,
      ease: "easeInOut",
      onComplete: () => onArrival(id),
    });
    return () => running.stop();
  }, [progress, id, from, to, onArrival]);

  const travelled = useTransform(progress, [0, 0.82], [0, 1]);
  const cx = useTransform(travelled, (step) => at(from + (to - from) * step).x);
  const cy = useTransform(travelled, (step) => at(from + (to - from) * step).y);
  const opacity = useTransform(progress, [0, 0.1, 0.74, 0.82], [0, 1, 1, 0]);
  const end = at(to);
  const ripple = useTransform(progress, [0.78, 1], [reach + 3, reach + 14]);
  const rippleOpacity = useTransform(progress, [0.78, 0.86, 1], [0, 0.7, 0]);

  return (
    <g pointerEvents="none">
      <motion.circle
        cx={end.x}
        cy={end.y}
        r={ripple}
        fill="none"
        strokeWidth={1.5}
        className={INK.free.stroke}
        style={{ opacity: rippleOpacity }}
      />
      <motion.circle cx={cx} cy={cy} r={5} strokeWidth={2} className={`fill-card ${INK.free.stroke}`} style={{ opacity }} />
    </g>
  );
}

/** What a party's net means for it, in the past tense once the circle is `settled`. */
export function netInWords(net: bigint, settled = false): string {
  if (net === 0n) return settled ? "no pagó nada" : "no paga nada";
  if (net > 0n) return `${settled ? "recibió" : "recibe"} ${formatAmount(net)}`;
  return `${settled ? "pagó" : "paga"} ${formatAmount(-net)}`;
}
