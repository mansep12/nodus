"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { useEffect } from "react";
import { EASE } from "@/lib/motion";
import { Pin, type Point, type Shot } from "./camera";
import { Cord, Note, Ring, line } from "./drawing";
import { position } from "./scenes";

/*
 * Why nobody pays on time: the delay comes down a chain. A row of
 * businesses, each owing the one before it, drawn link by link as the
 * camera travels along it from the days to the middle of the world. At its
 * end is you; whoever owes you is waiting for whoever owes them, and so on
 * back up the chain, which goes on past the edge of the frame.
 */

const R = 36;
const Y = 60;
/** From you, at the left, back along those who owe: the last is past the edge of the frame. */
const LINKS: Point[] = [-600, -300, 0, 300, 600, 900].map((x) => ({ x, y: Y }));
const LAST = LINKS.length - 1;

/** The shot that holds the chain, with you at its left and the rest going off to the right. */
export const CHAIN_SHOT: Shot = { x: 0, y: Y, width: 1700 };

/** What is said of each, under it, as the voice gets to it: seconds after the step. */
const SAID: { text: string; delay: number }[] = [
  { text: "Tú", delay: 0 },
  { text: "Quien te debe", delay: 0.1 },
  { text: "Quien le debe a él", delay: 1.4 },
  { text: "Y a ese, otro", delay: 2.3 },
];

/** A business of the chain: a ring that draws itself, and beats when the wait gets to it. */
function Link({
  at,
  shown,
  delay,
  waiting,
  wait,
  you,
}: {
  at: Point;
  shown: boolean;
  delay: number;
  waiting: boolean;
  wait: number;
  you: boolean;
}) {
  const pulse = useMotionValue(1);
  useEffect(() => {
    if (!waiting) return;
    const run = animate(pulse, [1, 1.16, 1], { duration: 0.7, delay: wait, ease: EASE, repeat: 1, repeatDelay: 0.9 });
    return () => run.stop();
  }, [pulse, waiting, wait]);
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <motion.g style={{ scale: pulse }}>
        <motion.circle
          r={R}
          className="lift fill-card"
          initial={false}
          animate={{ scale: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
          transition={{ duration: 0.5, delay: shown ? delay : 0, ease: EASE }}
        />
        <Ring r={R} drawn={shown} delay={delay} strokeWidth={3} className="stroke-ink" />
        {/* You are the one in ink. */}
        <motion.circle
          r={R - 12}
          className="fill-ink"
          initial={false}
          animate={{ scale: shown && you ? 1 : 0 }}
          transition={{ duration: 0.5, delay: shown ? delay + 0.3 : 0, ease: EASE }}
        />
      </motion.g>
    </g>
  );
}

export function Chain({ g }: { g: number }) {
  const p = position;
  const shown = g >= p("problema", 7) && g < p("nudo");
  const waiting = g === p("problema", 8);
  // It is drawn from its far end toward you, as the camera comes along it; it leaves all at once.
  const turn = (index: number) => 0.15 + (LAST - index) * 0.28;
  return (
    <g pointerEvents="none">
      {LINKS.slice(1).map((from, index) => {
        const shape = line(from, LINKS[index]!, R + 8, R + 14);
        return (
          <Cord
            key={index}
            d={shape.d}
            length={shape.length}
            head={shape.head}
            width={7}
            // What you are owed is in your blue; the rest is nobody's in particular.
            tone={waiting && index === 0 ? "credit" : "ink"}
            drawn={shown}
            delay={shown ? turn(index + 1) + 0.2 : 0}
            duration={0.5}
          />
        );
      })}
      {LINKS.map((at, index) => (
        <Link
          key={index}
          at={at}
          shown={shown}
          delay={shown ? turn(index) : 0}
          waiting={waiting}
          wait={0.2 + index * 0.32}
          you={index === 0}
        />
      ))}

      <Pin x={0} y={Y}>
        <Note
          shown={shown}
          to={{ x: 0, y: -150 }}
          leader={false}
          anchor="middle"
          rows="bottom"
          delay={1.5}
          lines={[
            { text: "Por qué se atrasan", kind: "kicker" },
            { text: "El atraso viene en cadena", kind: "title", gap: 6 },
          ]}
        />
      </Pin>
      {SAID.map((said, index) => (
        <Pin key={index} {...LINKS[index]!}>
          <Note
            shown={index === 0 ? shown : waiting}
            to={{ x: 0, y: (R * 1920) / CHAIN_SHOT.width + 24 }}
            leader={false}
            anchor="middle"
            rows="top"
            delay={index === 0 ? turn(0) + 0.5 : said.delay}
            lines={[{ text: said.text, kind: "label" }]}
          />
        </Pin>
      ))}
    </g>
  );
}
