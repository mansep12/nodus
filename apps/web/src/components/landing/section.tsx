import type { ReactNode } from "react";
import { Eyebrow } from "../ui";

/** Every band of the page is this wide. */
export const CONTAINER = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

interface SectionProps {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  /** A band on the softer canvas, with hairlines above and below. */
  band?: boolean;
}

/** A band of the page: its label, its headline in display type, a line about it, and what it shows. */
export function Section({ id, eyebrow, title, lede, children, band = false }: SectionProps) {
  const heading = `${id}-titulo`;
  return (
    <section id={id} aria-labelledby={heading} className={`scroll-mt-16 ${band ? "border-y border-hairline bg-canvas-soft" : ""}`}>
      <div className={`${CONTAINER} py-14 sm:py-24`}>
        <div className="max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={heading} className="display mt-3 text-4xl text-balance sm:text-5xl">
            {title}
          </h2>
          {lede && <p className="mt-5 text-lg text-body">{lede}</p>}
        </div>
        <div className="mt-10 sm:mt-14">{children}</div>
      </div>
    </section>
  );
}
