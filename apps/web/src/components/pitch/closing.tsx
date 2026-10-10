"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { useDraw } from "../cord";
import { REPO_URL } from "../landing/facts";
import { KNOT, KNOT_STRAND } from "../ui";

/*
 * The first frame, which is also the last: over the whole world, small and
 * faint, the knot draws itself, then the name and what Nodus does in six
 * words. As the cover it holds a figure of what late payments cost; as the
 * closing, what is real and what is not, and where the code is.
 */

function Strand({ d, drawn, delay }: { d: string; drawn: boolean; delay: number }) {
  const draw = useDraw(KNOT_STRAND, drawn, { delay, duration: 0.9 });
  return <motion.path d={d} style={draw.style} />;
}

/** Words that rise into place from just below, after the knot. */
function Rise({ shown, delay, className, children }: { shown: boolean; delay: number; className: string; children: React.ReactNode }) {
  return (
    <motion.p
      className={className}
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 18, scale: 0.97 }}
      transition={{ duration: 0.9, delay: shown ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.p>
  );
}

/**
 * When each part comes, in seconds: the knot strand by strand, the name as
 * it closes, the six words. As the cover the whole of it is drawn in two
 * seconds and holds; at the end, what is real and what is not waits for the
 * six words, and the address of the code comes a step later.
 */
const TIMING = { strands: 0.2, strand: 0.3, name: 0.9, words: 1.3, after: 2.3 };

interface ClosingProps {
  /** The knot, the name and the six words: the cover and the closing. */
  shown: boolean;
  /** On the cover: how many small businesses the late payments have brought to the edge, and who says so. */
  figure: boolean;
  /** At the closing: what is real and what is not. */
  real: boolean;
  repo: boolean;
}

export function Closing({ shown, figure, real, repo }: ClosingProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      <svg
        viewBox="0 0 32 32"
        className="size-[220px] text-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        aria-hidden
      >
        {KNOT.map((strand, index) => (
          <Strand key={strand.slice(0, 12)} d={strand} drawn={shown} delay={TIMING.strands + index * TIMING.strand} />
        ))}
      </svg>
      <Rise shown={shown} delay={TIMING.name} className="display mt-10 text-[140px] leading-none tracking-[-0.03em]">
        Nodus
      </Rise>
      <Rise shown={shown} delay={TIMING.words} className="display mt-8 text-[52px] text-body">
        Desanuda las deudas <em>entre negocios</em>.
      </Rise>
      {/* The cover's figure and the closing's line take the same place: they are never there together. */}
      <div className="relative mt-16 w-full">
        <Rise shown={real} delay={TIMING.after} className="text-[28px] text-muted">
          Hoy en la red de pruebas de Stellar. Facturas e identidad, simuladas.
        </Rise>
        <div className="absolute inset-x-0 top-0">
          <Rise shown={figure} delay={0} className="display text-[56px] leading-none text-debt-deep">
            6 de cada 10 pymes
          </Rise>
          <Rise shown={figure} delay={0.15} className="mt-4 text-[32px] text-ink">
            al borde del cierre o endeudadas por los atrasos de pago
          </Rise>
          <Rise shown={figure} delay={0.3} className="mt-3 text-[24px] text-muted">
            Encuesta Asech y CobranzaOnline, 2025
          </Rise>
        </div>
      </div>
      {/* Its step comes while the line above is still on its way in: it waits for it. */}
      <Rise shown={repo} delay={1.5} className="mt-5 font-mono text-[26px] text-ink">
        {REPO_URL.replace("https://", "")}
      </Rise>
    </div>
  );
}
