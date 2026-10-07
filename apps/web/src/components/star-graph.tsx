"use client";

import { animate, motion, useMotionValue, useTransform, type MotionValue, type PanInfo } from "motion/react";
import { useEffect, useRef } from "react";
import { TOKEN_SYMBOL } from "@/lib/config";
import type { Relation, Side } from "@/lib/books";
import { clip, formatAmount, initials } from "@/lib/format";
import { INK } from "@/lib/tones";
import { useDraw } from "./cord";

/** The address of the leaf that stands for the relations that do not fit. */
export const OTHERS = "others";

const FULL = { width: 660, height: 480, ring: 150 };
/** Without names beside the leaves the drawing is a square. */
const COMPACT = { width: 400, height: 400, ring: 142 };
const FOCUS = 34;
/** A leaf grows with what it stands for, between these radii. */
const MIN_LEAF = 15;
const MAX_LEAF = 23;
const MIN_CORD = 1.5;
const MAX_CORD = 12;
const MAX_LEAVES = 9;
const SNAP_BACK = { type: "spring", stiffness: 240, damping: 11, mass: 0.7 } as const;

interface Point {
  x: number;
  y: number;
}

/** More relations than fit are drawn as the largest ones and one leaf for the rest. */
export function fold(relations: Relation[]): Relation[] {
  const sorted = [...relations].sort((a, b) => {
    const [weightA, weightB] = [a.standing + a.pending, b.standing + b.pending];
    return weightA === weightB ? a.name.localeCompare(b.name) : weightA > weightB ? -1 : 1;
  });
  if (sorted.length <= MAX_LEAVES) return sorted;
  const rest = sorted.slice(MAX_LEAVES - 1);
  return [
    ...sorted.slice(0, MAX_LEAVES - 1),
    {
      address: OTHERS,
      name: `Otros ${rest.length} negocios`,
      standing: rest.reduce((sum, relation) => sum + relation.standing, 0n),
      pending: rest.reduce((sum, relation) => sum + relation.pending, 0n),
      debts: rest.reduce((sum, relation) => sum + relation.debts, 0),
      inCircle: rest.some((relation) => relation.inCircle),
    },
  ];
}

/** Where each of `count` leaves goes around the ring, clockwise from the top. */
function spread(count: number): number[] {
  if (count === 2) return [Math.PI, 0];
  // An even number is turned half a step so that no leaf sits right above or below the centre.
  const start = -Math.PI / 2 + (count % 2 === 0 ? Math.PI / count : 0);
  return Array.from({ length: count }, (_, index) => start + (index * 2 * Math.PI) / count);
}

interface Props {
  tone: Side;
  /** The business in focus, at the centre. */
  focus: string;
  relations: Relation[];
  /** The relation being looked at, here or in the list beside the drawing. */
  selected: string | null;
  onSelect: (address: string | null) => void;
  /** Whether to write each business's name beside its leaf. */
  labels?: boolean;
}

/**
 * One side of the books of a business as a star: the business at the centre
 * and a cord to every business it is owed by, or owes to. The thicker the
 * cord, the larger the debt. Leaves can be pulled; they spring back.
 */
export function StarGraph({ tone, focus, relations, selected, onSelect, labels = true }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const size = labels ? FULL : COMPACT;
  const center = { x: size.width / 2, y: size.height / 2 };
  const leaves = fold(relations);
  const angles = spread(leaves.length);
  const largest = leaves.reduce((max, leaf) => (leaf.standing + leaf.pending > max ? leaf.standing + leaf.pending : max), 0n);
  const ink = INK[tone];

  /** Screen pixels per unit of the drawing, so that a pulled leaf stays under the pointer. */
  const zoom = () => (svg.current ? svg.current.getBoundingClientRect().width / size.width || 1 : 1);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="w-full touch-pan-y select-none"
      role="group"
      aria-label={tone === "credit" ? `Negocios que le deben a ${focus}` : `Negocios a los que ${focus} les debe`}
      onPointerDown={(event) => event.target === event.currentTarget && onSelect(null)}
    >
      <circle cx={center.x} cy={center.y} r={size.ring} fill="none" strokeWidth={1} className="stroke-hairline" />
      {leaves.map((leaf, index) => {
        const weight = leaf.standing + leaf.pending;
        const share = largest === 0n ? 0 : Math.sqrt(Number(weight) / Number(largest));
        return (
          <Leaf
            key={leaf.address}
            leaf={leaf}
            tone={tone}
            index={index}
            angle={angles[index]!}
            center={center}
            ring={size.ring}
            cord={MIN_CORD + (MAX_CORD - MIN_CORD) * share}
            radius={MIN_LEAF + (MAX_LEAF - MIN_LEAF) * share}
            active={selected === leaf.address}
            dimmed={selected !== null && selected !== leaf.address}
            onSelect={onSelect}
            zoom={zoom}
            labels={labels}
          />
        );
      })}

      <g pointerEvents="none">
        <circle cx={center.x} cy={center.y} r={FOCUS + 7} fill="none" strokeWidth={1.25} className={`${ink.stroke} opacity-45`} />
        <circle cx={center.x} cy={center.y} r={FOCUS} className="lift-high fill-ink" />
        <text x={center.x} y={center.y + 6} textAnchor="middle" className="fill-white text-[17px] font-semibold tracking-wide">
          {initials(focus)}
        </text>
      </g>
    </svg>
  );
}

interface LeafProps {
  leaf: Relation;
  tone: Side;
  index: number;
  angle: number;
  center: Point;
  ring: number;
  /** Width of the cord. */
  cord: number;
  /** Size of the leaf. */
  radius: number;
  active: boolean;
  dimmed: boolean;
  onSelect: (address: string | null) => void;
  zoom: () => number;
  labels: boolean;
}

function Leaf({ leaf, tone, index, angle, center, ring, cord, radius, active, dimmed, onSelect, zoom, labels }: LeafProps) {
  const ink = INK[tone];
  const rest = { x: center.x + ring * Math.cos(angle), y: center.y + ring * Math.sin(angle) };
  // How far the leaf has been pulled from where it rests.
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const x = useTransform(pullX, (pull) => rest.x + pull);
  const y = useTransform(pullY, (pull) => rest.y + pull);

  const pull = (_: PointerEvent, info: PanInfo) => {
    const scale = zoom();
    pullX.set(pullX.get() + info.delta.x / scale);
    pullY.set(pullY.get() + info.delta.y / scale);
  };
  const release = () => {
    animate(pullX, 0, SNAP_BACK);
    animate(pullY, 0, SNAP_BACK);
  };

  const onlyPending = leaf.standing === 0n;
  const delay = 0.12 + index * 0.05;
  // The cord is drawn out from the centre.
  const draw = useDraw(ring, true, { delay });
  const verb = tone === "credit" ? "te debe" : "le debes";
  const amount = onlyPending ? leaf.pending : leaf.standing;

  return (
    <motion.g animate={{ opacity: dimmed ? 0.22 : 1 }} transition={{ duration: 0.18 }}>
      {onlyPending ? (
        // A debt nobody has accepted yet is a dotted cord.
        <motion.line
          x1={center.x}
          y1={center.y}
          x2={x}
          y2={y}
          strokeWidth={Math.max(cord, 2.5)}
          strokeLinecap="round"
          strokeDasharray="0.1 8"
          className={ink.stroke}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.85 }}
          transition={{ duration: 0.5, delay }}
        />
      ) : (
        <motion.line
          x1={center.x}
          y1={center.y}
          x2={x}
          y2={y}
          strokeWidth={cord}
          strokeLinecap="round"
          className={ink.stroke}
          style={draw.style}
        />
      )}
      {active && <Bead x={x} y={y} center={center} inward={tone === "credit"} className={ink.stroke} />}

      <motion.g
        style={{ x, y }}
        className="cursor-grab outline-none active:cursor-grabbing"
        role="img"
        tabIndex={0}
        aria-label={`${leaf.name} ${verb} ${formatAmount(amount)} ${TOKEN_SYMBOL}${onlyPending ? ", por aceptar" : ""}`}
        onPan={pull}
        onPanEnd={release}
        onHoverStart={() => onSelect(leaf.address)}
        onHoverEnd={() => onSelect(null)}
        onTap={() => onSelect(leaf.address)}
        onFocus={() => onSelect(leaf.address)}
        onBlur={() => onSelect(null)}
      >
        {/* Easier to catch than the leaf itself. */}
        <circle r={radius + 12} fill="transparent" />
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: active ? 1.14 : 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 17, delay: active ? 0 : delay + 0.25 }}
        >
          {leaf.inCircle && <circle r={radius + 5.5} fill="none" strokeWidth={1.25} className={ink.stroke} />}
          <circle
            r={radius}
            strokeWidth={2.25}
            strokeDasharray={onlyPending ? "3 3.5" : undefined}
            className={`lift ${ink.stroke} ${active ? ink.softFill : "fill-card"} transition-colors`}
          />
          <text y={4.5} textAnchor="middle" className={`fill-ink font-semibold ${radius < 18 ? "text-[10.5px]" : "text-[12px]"}`}>
            {leaf.address === OTHERS ? `+${leaf.name.split(" ")[1]}` : initials(leaf.name)}
          </text>
        </motion.g>
        {labels && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: delay + 0.4 }}>
            <Label leaf={leaf} angle={angle} radius={radius + (leaf.inCircle ? 6 : 0)} room={Math.min(rest.x, 2 * center.x - rest.x)} />
          </motion.g>
        )}
      </motion.g>
    </motion.g>
  );
}

interface LabelProps {
  leaf: Relation;
  angle: number;
  /** How far from the centre of the leaf the text starts. */
  radius: number;
  /** How far the leaf is from the nearest side of the drawing. */
  room: number;
}

/** About how wide a letter of a name is. */
const LETTER = 6.8;

/** The name and the amount of a leaf, written on the side of the ring it is on. */
function Label({ leaf, angle, radius, room }: LabelProps) {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const side = cos > 0.25 ? "right" : cos < -0.25 ? "left" : sin < 0 ? "above" : "below";
  const onlyPending = leaf.standing === 0n;

  const lines = [
    // Beside the leaf a name has what is left up to the edge; above or below it, twice that.
    {
      text: clip(leaf.name, Math.floor(((side === "left" || side === "right" ? room - radius - 12 : 2 * room) - 6) / LETTER)),
      className: "fill-ink text-[13px] font-medium",
    },
    { text: formatAmount(onlyPending ? leaf.pending : leaf.standing), className: "fill-body text-[13px] tabular-nums" },
    ...(leaf.pending > 0n
      ? [{ text: onlyPending ? "por aceptar" : `+ ${formatAmount(leaf.pending)} por aceptar`, className: "fill-muted text-[11px]" }]
      : []),
  ];
  const LINE = 16;
  const anchor = side === "right" ? "start" : side === "left" ? "end" : "middle";
  const textX = side === "right" ? radius + 12 : side === "left" ? -radius - 12 : 0;
  const first =
    side === "above" ? -radius - 13 - (lines.length - 1) * LINE : side === "below" ? radius + 23 : 4.5 - ((lines.length - 1) * LINE) / 2;

  return (
    <g pointerEvents="none">
      {lines.map((line, index) => (
        <text key={index} x={textX} y={first + index * LINE} textAnchor={anchor} className={line.className}>
          {line.text}
        </text>
      ))}
    </g>
  );
}

interface BeadProps {
  /** Where the leaf is. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  center: Point;
  /** Whether the money goes to the centre or away from it. */
  inward: boolean;
  className: string;
}

/** A bead that runs along a cord the way the money is owed. */
function Bead({ x, y, center, inward, className }: BeadProps) {
  const progress = useMotionValue(0);
  useEffect(() => {
    const running = animate(progress, 1, { duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.1 });
    return () => running.stop();
  }, [progress]);

  // From the edge of one node to the edge of the other, as a share of the way from the leaf to the centre.
  const fromLeaf = (step: number) => (inward ? 0.15 + 0.6 * step : 0.75 - 0.6 * step);
  const cx = useTransform([progress, x], ([step, leaf]: number[]) => leaf! + (center.x - leaf!) * fromLeaf(step!));
  const cy = useTransform([progress, y], ([step, leaf]: number[]) => leaf! + (center.y - leaf!) * fromLeaf(step!));
  const opacity = useTransform(progress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={3.6}
      strokeWidth={1.75}
      className={`fill-card ${className}`}
      style={{ opacity }}
      pointerEvents="none"
    />
  );
}
