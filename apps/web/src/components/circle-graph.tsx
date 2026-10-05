"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { formatAmount } from "@/lib/format";
import type { CircleView } from "@/lib/types";

// Wider than tall: names are written beside the nodes at the sides.
const WIDTH = 580;
const HEIGHT = 420;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RING = 118;
const NODE = 30;
/** Side of the square that fits the ring alone, without names. */
const COMPACT = 2 * (RING + NODE + 40);

interface Point {
  x: number;
  y: number;
}

const towards = (from: Point, to: Point, distance: number): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
};

interface Props {
  circle: CircleView;
  me: string;
  nameOf: (address: string) => string;
  /** Whether to write each business's name beside its node. Without them the drawing is narrower. */
  labels?: boolean;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The circle drawn as a knot: every business is a node and every debt a cord
 * to the business it is owed to. When the circle is settled the cords let go.
 */
export function CircleGraph({ circle, me, nameOf, labels = true }: Props) {
  const arrow = useId();
  const settled = circle.proposal?.status === "settled";
  const count = circle.parties.length;

  // Two parties sit side by side; more are spread around the ring from the top.
  const start = count === 2 ? Math.PI : -Math.PI / 2;
  const position = new Map<string, Point>(
    circle.parties.map((party, index) => {
      const angle = start + (index * 2 * Math.PI) / count;
      return [party.address, { x: CENTER.x + RING * Math.cos(angle), y: CENTER.y + RING * Math.sin(angle) }];
    }),
  );

  const cords = circle.edges.map((edge) => {
    const from = position.get(edge.from)!;
    const to = position.get(edge.to)!;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    // Cords bow away from the centre. Between two parties the middle is the
    // centre, so each cord bows to its own side instead.
    const acrossCentre = Math.hypot(middle.x - CENTER.x, middle.y - CENTER.y) < 1;
    const outwards = acrossCentre
      ? { x: middle.x - (to.y - from.y), y: middle.y + (to.x - from.x) }
      : { x: 2 * middle.x - CENTER.x, y: 2 * middle.y - CENTER.y };
    const control = towards(middle, outwards, acrossCentre ? 70 : 30);
    const tail = towards(from, control, NODE + 6);
    const head = towards(to, control, NODE + 12);
    const label = towards(
      { x: (tail.x + 2 * control.x + head.x) / 4, y: (tail.y + 2 * control.y + head.y) / 4 },
      outwards,
      16,
    );
    return { ...edge, path: `M ${tail.x} ${tail.y} Q ${control.x} ${control.y} ${head.x} ${head.y}`, label };
  });

  return (
    <svg
      viewBox={labels ? `0 0 ${WIDTH} ${HEIGHT}` : `${CENTER.x - COMPACT / 2} ${CENTER.y - COMPACT / 2} ${COMPACT} ${COMPACT}`}
      className="w-full max-w-xl"
      role="img"
      aria-label="Círculo de deudas"
    >
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-debt" />
        </marker>
      </defs>

      {cords.map((cord) => (
        <g key={`${cord.from}>${cord.to}`}>
          <motion.path
            d={cord.path}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="stroke-debt"
            markerEnd={settled ? undefined : `url(#${arrow})`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={settled ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
          <motion.g animate={{ opacity: settled ? 0 : 1 }} transition={{ duration: 0.5 }}>
            <rect
              x={cord.label.x - 30}
              y={cord.label.y - 11}
              width={60}
              height={22}
              rx={11}
              className="fill-surface stroke-line"
            />
            <text x={cord.label.x} y={cord.label.y + 4} textAnchor="middle" className="fill-ink text-[12px] font-medium tabular-nums">
              {formatAmount(cord.amount)}
            </text>
          </motion.g>
        </g>
      ))}

      <motion.g
        initial={false}
        animate={{ scale: settled ? 1 : 0.92, opacity: 1 }}
        style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}
      >
        <text x={CENTER.x} y={CENTER.y - 16} textAnchor="middle" className="fill-muted text-[12px]">
          {settled ? "se cancelaron" : "se cancelan"}
        </text>
        <text
          x={CENTER.x}
          y={CENTER.y + 14}
          textAnchor="middle"
          className={`text-[30px] font-semibold tabular-nums ${settled ? "fill-free" : "fill-ink"}`}
        >
          {formatAmount(circle.cleared)}
        </text>
        <text x={CENTER.x} y={CENTER.y + 34} textAnchor="middle" className="fill-muted text-[12px]">
          {circle.moved === "0" ? "sin mover dinero" : `moviendo ${formatAmount(circle.moved)}`}
        </text>
      </motion.g>

      {circle.parties.map((party) => {
        const at = position.get(party.address)!;
        const name = nameOf(party.address);
        const mine = party.address === me;
        const done = settled || party.signed;
        // Names go outside the ring, on the side their node is on.
        const side = at.x < CENTER.x - 1 ? "end" : at.x > CENTER.x + 1 ? "start" : "middle";
        const labelX = side === "middle" ? at.x : at.x + (side === "start" ? NODE + 10 : -NODE - 10);
        const labelY = side === "middle" ? at.y + (at.y < CENTER.y ? -NODE - 24 : NODE + 20) : at.y - 2;
        const net = BigInt(party.net);
        return (
          <g key={party.address}>
            <circle
              cx={at.x}
              cy={at.y}
              r={NODE}
              strokeWidth={2.5}
              className={`${mine ? "fill-ink" : "fill-surface"} ${done ? "stroke-free" : "stroke-ink"}`}
            />
            <text
              x={at.x}
              y={at.y + 5}
              textAnchor="middle"
              className={`text-[15px] font-semibold ${mine ? "fill-paper" : "fill-ink"}`}
            >
              {initials(name)}
            </text>
            {done && (
              <g transform={`translate(${at.x + 21} ${at.y - 21})`}>
                <circle r={10} className="fill-free stroke-surface" strokeWidth={2} />
                <path d="M -4 0 L -1 3 L 4 -3" fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-surface" />
              </g>
            )}
            {labels && (
              <>
                <text x={labelX} y={labelY} textAnchor={side} className="fill-ink text-[13px] font-medium">
                  {name.length > 16 ? `${name.slice(0, 15)}…` : name}
                  {mine && " (tú)"}
                </text>
                <text x={labelX} y={labelY + 16} textAnchor={side} className="fill-muted text-[12px] tabular-nums">
                  {netInWords(net, settled)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** What a party's net means for it, in the past tense once the circle is `settled`. */
export function netInWords(net: bigint, settled = false): string {
  if (net === 0n) return settled ? "no pagó nada" : "no paga nada";
  if (net > 0n) return `${settled ? "recibió" : "recibe"} ${formatAmount(net)}`;
  return `${settled ? "pagó" : "paga"} ${formatAmount(-net)}`;
}
