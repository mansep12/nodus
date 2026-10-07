import { INK, type Tone } from "@/lib/tones";

/*
 * Small drawings for the steps, in the same language as the graphs of the
 * app: the business looking is a filled node, a dotted cord is a debt nobody
 * has accepted yet, a tick is a signature, and a dotted ring is a circle
 * that has let go. They decorate the words beside them, which say it all.
 */

const WIDTH = 240;
const HEIGHT = 120;

interface NodeProps {
  x: number;
  y: number;
  r?: number;
  /** The business looking, in ink. */
  me?: boolean;
  /** Has signed. */
  done?: boolean;
  /** Has not accepted the debt yet. */
  pending?: boolean;
  label?: string;
}

function Node({ x, y, r = 14, me = false, done = false, pending = false, label }: NodeProps) {
  const ring = done ? "stroke-free" : me ? "stroke-ink" : pending ? "stroke-muted" : "stroke-ink";
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle
        r={r}
        strokeWidth={2.25}
        strokeDasharray={pending ? "3 3.5" : undefined}
        className={`lift ${me ? "fill-ink" : "fill-card"} ${ring}`}
      />
      {label && (
        <text y={4} textAnchor="middle" className={`text-tiny font-semibold ${me ? "fill-white" : "fill-ink"}`}>
          {label}
        </text>
      )}
      {done && (
        <g transform={`translate(${r * 0.72} ${-r * 0.72})`}>
          <circle r={7} strokeWidth={2} className="fill-free stroke-card" />
          <path
            d="M -3 0 L -0.8 2.3 L 3 -2.3"
            fill="none"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-card"
          />
        </g>
      )}
    </g>
  );
}

interface ArrowProps {
  x: number;
  y: number;
  /** Which way it points, in degrees clockwise from the right. */
  heading: number;
  tone: Tone;
  half: number;
}

function Arrow({ x, y, heading, tone, half }: ArrowProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading})`}>
      <path
        d={`M ${-half * 0.8} ${-half} L ${half} 0 L ${-half * 0.8} ${half} z`}
        strokeWidth={1.25}
        strokeLinejoin="round"
        className={`${INK[tone].fill} ${INK[tone].stroke}`}
      />
    </g>
  );
}

interface StretchProps {
  cx: number;
  cy: number;
  r: number;
  /** Angles in degrees, clockwise from the right, of the node it leaves and the node it reaches. */
  from: number;
  to: number;
  /** How far from each node's centre the stretch starts and stops. */
  gapFrom: number;
  gapTo: number;
  tone: Tone;
  width: number;
}

/** A debt as a stretch of ring from who owes it to whom, with an arrowhead that says which way. */
function Stretch({ cx, cy, r, from, to, gapFrom, gapTo, tone, width }: StretchProps) {
  const start = (from * Math.PI) / 180 + gapFrom / r;
  let end = (to * Math.PI) / 180 - gapTo / r;
  while (end < start) end += 2 * Math.PI;
  const at = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  const [tail, head] = [at(start), at(end)];
  return (
    <g>
      <path
        d={`M ${tail.x} ${tail.y} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${head.x} ${head.y}`}
        fill="none"
        strokeWidth={width}
        strokeLinecap="round"
        className={INK[tone].stroke}
      />
      <Arrow x={head.x} y={head.y} heading={(end * 180) / Math.PI + 90} tone={tone} half={Math.max(4, width * 1.15)} />
    </g>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full max-w-[280px]" aria-hidden>
      {children}
    </svg>
  );
}

const ME = { x: 52, y: 60, r: 17 };
const OTHER = { x: 188, y: 60, r: 15 };

/** A debt written down, waiting for the one who owes it. */
export function RegisterFigure() {
  return (
    <Figure>
      <line
        x1={OTHER.x - OTHER.r - 9}
        y1={ME.y}
        x2={ME.x + ME.r + 9}
        y2={ME.y}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray="0.1 8"
        className={`${INK.credit.stroke} opacity-85`}
      />
      <text x={120} y={46} textAnchor="middle" className="fill-ink text-caption font-medium">
        100
      </text>
      <text x={120} y={83} textAnchor="middle" className="fill-muted text-tiny">
        por aceptar
      </text>
      <Node {...ME} me label="PS" />
      <Node {...OTHER} pending label="MA" />
    </Figure>
  );
}

/** The same debt, accepted: a solid cord that says which way the money is owed. */
export function AcceptFigure() {
  const head = ME.x + ME.r + 12;
  return (
    <Figure>
      <line
        x1={OTHER.x - OTHER.r - 8}
        y1={ME.y}
        x2={head + 2}
        y2={ME.y}
        strokeWidth={4.5}
        strokeLinecap="round"
        className={INK.credit.stroke}
      />
      <Arrow x={head} y={ME.y} heading={180} tone="credit" half={5.5} />
      <text x={120} y={46} textAnchor="middle" className="fill-ink text-caption font-medium">
        100
      </text>
      <text x={120} y={83} textAnchor="middle" className="fill-muted text-tiny">
        aceptada
      </text>
      <Node {...ME} me label="PS" />
      <Node {...OTHER} done label="MA" />
    </Figure>
  );
}

const RING = { cx: 120, cy: 60, r: 41 };
/** The business looking sits at the bottom; the other two go round clockwise. */
const AROUND = [90, 210, 330];
const on = (angle: number, r = RING.r) => ({
  x: RING.cx + r * Math.cos((angle * Math.PI) / 180),
  y: RING.cy + r * Math.sin((angle * Math.PI) / 180),
});

/** A circle found: each business sees its own two debts and signs its part. */
export function SignFigure() {
  const [me, mill, carrier] = AROUND as [number, number, number];
  return (
    <Figure>
      <circle {...RING} fill="none" strokeWidth={1} className="stroke-hairline-strong" />
      <Stretch {...RING} from={me} to={mill} gapFrom={22} gapTo={24} tone="debt" width={5} />
      <Stretch {...RING} from={mill} to={carrier} gapFrom={20} gapTo={22} tone="neutral" width={1.75} />
      <Stretch {...RING} from={carrier} to={me} gapFrom={20} gapTo={26} tone="credit" width={4.5} />
      <text x={RING.cx} y={RING.cy + 4} textAnchor="middle" className="fill-muted text-tiny">
        pagas 10
      </text>
      <Node {...on(me)} r={16} me done label="PS" />
      <Node {...on(mill)} done label="MA" />
      <Node {...on(carrier)} label="FR" />
    </Figure>
  );
}

/** The circle settled: the cords are gone and the ring is left dotted. */
export function SettleFigure() {
  const [me, mill, carrier] = AROUND as [number, number, number];
  return (
    <Figure>
      <circle {...RING} fill="none" strokeWidth={1} strokeDasharray="2 6" className="stroke-free/60" />
      <text x={RING.cx} y={RING.cy + 8} textAnchor="middle" className="display fill-free text-2xl">
        270
      </text>
      <Node {...on(me)} r={16} me done label="PS" />
      <Node {...on(mill)} done label="MA" />
      <Node {...on(carrier)} done label="FR" />
    </Figure>
  );
}
