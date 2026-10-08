/**
 * How things move in Nodus, after the "Motion" section of DESIGN.md. One
 * curve for everything: quick to leave, slow to arrive.
 */
export const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * A circle being untied, in seconds: its debts are pulled tight into the
 * knot, and then the knot lets go.
 */
export const UNTYING = { tight: 1.5, loose: 1.1 };
