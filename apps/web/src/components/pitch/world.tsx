"use client";

import { motion } from "motion/react";
import { Camera, FRAME, Far, type Shot } from "./camera";
import { CHAIN_SHOT, Chain } from "./chain";
import { Closing } from "./closing";
import { DAYS_SHOT, Days } from "./days";
import { WEB_BOUNDS, Web } from "./network";
import { position, type SceneId } from "./scenes";
import { Slate } from "./slate";
import { TWENTY, Twenty } from "./stellar";
import { Triangle } from "./triangle";

/*
 * The whole video as one drawing and one camera. The triangle of the story
 * is the middle of the world and never leaves it; the days it takes to be
 * paid lie to its right, where the video starts, the web grows round it,
 * the ring of twenty is off to the side. Each step says where the camera
 * goes, and every part of the world reads from the same step what it should
 * be doing. The camera is what keeps it from being a set of slides: it
 * never cuts, it follows what is being said from one thing to the next, and
 * what lies behind the drawing goes by more slowly than the drawing does.
 */

/** The whole world, small: the cover and the closing. */
const FAR: Shot = { x: 800, y: 40, width: 6400 };

/** The web whole, with air round it. */
const WEB: Shot = {
  x: (WEB_BOUNDS.left + WEB_BOUNDS.right) / 2,
  y: (WEB_BOUNDS.top + WEB_BOUNDS.bottom) / 2,
  width: Math.max(WEB_BOUNDS.right - WEB_BOUNDS.left + 260, (WEB_BOUNDS.bottom - WEB_BOUNDS.top + 200) * (FRAME.width / FRAME.height)),
};

/** Where the camera is from each step on, until the next entry, and how many seconds it takes to get there (1.5 if not said). */
const SHOTS: [SceneId, number, Shot, number?][] = [
  // The cover shows the whole world; from it, down to the days it takes to be paid, and from them along the chain to the middle.
  ["problema", 0, FAR],
  ["problema", 2, DAYS_SHOT, 2.4],
  ["problema", 7, CHAIN_SHOT, 2.4],
  // The example: in close where the first two will be, across to the third, back to see the circle close, and in on what it adds up to.
  ["nudo", 0, { x: -40, y: 60, width: 1500 }, 2.2],
  ["nudo", 2, { x: 0, y: 30, width: 1650 }, 2],
  ["nudo", 3, { x: 0, y: 30, width: 1820 }, 2.2],
  ["nudo", 4, { x: 0, y: 50, width: 1600 }, 2.4],
  // The idea: up, to make room for the name over the circle; in on the count; over to the mill that receives; and back for the knot.
  ["idea", 0, { x: 0, y: -40, width: 1800 }, 2.2],
  ["idea", 4, { x: 0, y: 10, width: 1650 }, 2],
  ["idea", 5, { x: 0, y: 20, width: 1450 }, 1.8],
  ["idea", 6, { x: -50, y: 0, width: 1560 }, 2],
  ["idea", 7, { x: -110, y: -10, width: 1500 }, 1.8],
  ["idea", 8, { x: 0, y: 20, width: 1700 }, 2.2],
  // The same triangle, this time reducing what is owed without making payments.
  ["caja", 0, { x: 0, y: -30, width: 1800 }, 2],
  ["caja", 2, { x: 0, y: 0, width: 1700 }, 2],
  ["caja", 3, { x: -60, y: 20, width: 1640 }, 1.8],
  ["caja", 4, { x: 60, y: 20, width: 1640 }, 1.8],
  ["caja", 5, { x: 0, y: 0, width: 1800 }, 1.8],
  // The web grows from the bakery, below the middle, and the camera pulls back as it does, until it holds all of it.
  ["red", 0, { x: 0, y: 130, width: 2200 }, 2],
  ["red", 3, { x: 0, y: 90, width: 3000 }, 2.4],
  ["red", 4, { x: 0, y: 60, width: 3700 }, 2.4],
  ["red", 5, WEB, 3.2],
  ["veinte", 0, { x: TWENTY.x, y: TWENTY.y + 20, width: 2200 }],
  ["veinte", 3, { x: TWENTY.x + 320, y: TWENTY.y + 20, width: 2200 }],
  ["stellar", 0, { x: TWENTY.x, y: TWENTY.y + 40, width: 2600 }],
  ["cierre", 0, FAR],
];

/**
 * What the world is drawn on, in three depths, so that when the camera
 * moves it can be seen to move and the frame has a near and a far. On the
 * world itself, a fine grid of dots, which goes by with the drawing. Behind
 * it, rings further apart, which go by more slowly. Furthest, the blooms of
 * the brand, large and soft, which hardly move at all.
 */
const GROUND = { x: -2600, y: -2200, width: 7600, height: 4400, step: 56 };
const BEHIND = { x: -9000, y: -6000, width: 18000, height: 12000 };

/** The blooms, where they are in their own depth: spread under everywhere the camera goes. */
const BLOOMS: { x: number; y: number; r: number; color: string }[] = [
  { x: -520, y: -260, r: 620, color: "var(--color-lavender)" },
  { x: 380, y: 300, r: 700, color: "var(--color-sky)" },
  { x: -180, y: 520, r: 520, color: "var(--color-peach)" },
  { x: 900, y: -320, r: 640, color: "var(--color-mint)" },
  { x: 1400, y: 380, r: 600, color: "var(--color-rose)" },
  { x: -1100, y: 280, r: 560, color: "var(--color-mint)" },
  { x: 2000, y: -120, r: 680, color: "var(--color-sky)" },
];

function Ground() {
  return (
    <>
      <defs>
        <pattern id="pitch-ground" width={GROUND.step} height={GROUND.step} patternUnits="userSpaceOnUse">
          <circle cx={GROUND.step / 2} cy={GROUND.step / 2} r={2.4} className="fill-hairline-strong" />
        </pattern>
        <pattern id="pitch-behind" width={260} height={260} patternUnits="userSpaceOnUse">
          <circle cx={70} cy={90} r={9} fill="none" strokeWidth={2} className="stroke-hairline-strong" />
          <circle cx={200} cy={210} r={4} className="fill-hairline-strong" />
        </pattern>
        {BLOOMS.map((bloom, index) => (
          <radialGradient key={index} id={`pitch-bloom-${index}`}>
            <stop offset="0%" stopColor={bloom.color} stopOpacity={0.42} />
            <stop offset="55%" stopColor={bloom.color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={bloom.color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <Far depth={0.28}>
        {BLOOMS.map((bloom, index) => (
          <circle key={index} cx={bloom.x} cy={bloom.y} r={bloom.r} fill={`url(#pitch-bloom-${index})`} />
        ))}
      </Far>
      <Far depth={0.55}>
        <rect {...BEHIND} fill="url(#pitch-behind)" opacity={0.5} />
      </Far>
      <rect {...GROUND} fill="url(#pitch-ground)" pointerEvents="none" />
    </>
  );
}

function shotAt(g: number): { shot: Shot; duration: number } {
  let found = { shot: SHOTS[0]![2], duration: 1.5 };
  for (const [id, step, shot, duration = 1.5] of SHOTS) if (position(id, step) <= g) found = { shot, duration };
  return found;
}

/**
 * The world at step `g`. The camera reads its own step, `camera`, which the
 * player takes from a moment ahead of the voice, so that it sets off before
 * the line and the shot is arriving as it is said.
 */
export function World({ g, camera = g }: { g: number; camera?: number }) {
  // The cover and the closing are the same frame: the world far and faint behind the knot and the name.
  const cover = g <= position("problema", 1);
  const closing = g >= position("cierre");
  const { shot, duration } = shotAt(camera);
  return (
    <>
      <Camera shot={shot} duration={duration} label="Las deudas entre negocios, y lo que Nodus hace con ellas">
        <motion.g initial={false} animate={{ opacity: cover || closing ? 0.2 : 1 }} transition={{ duration: 1.6, ease: "easeInOut" }}>
          <Ground />
          <Web g={g} />
          <Days g={g} />
          <Chain g={g} />
          <Twenty g={g} />
          <Triangle g={g} />
        </motion.g>
      </Camera>
      <Closing shown={cover || closing} figure={g === position("problema", 1)} real={closing} repo={g >= position("cierre", 1)} />
      {g === position("demo") && <Slate />}
    </>
  );
}
