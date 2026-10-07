"use client";

import { useEffect, useState } from "react";
import { INK } from "@/lib/tones";
import type { CircleView } from "@/lib/types";
import { CircleGraph, netInWords } from "../circle-graph";
import { Avatar, Bloom } from "../ui";

const [BAKERY, MILL, CARRIER] = ["panaderia", "molino", "fletes"];
const NAMES: Record<string, string> = { [BAKERY]: "Panadería Sur", [MILL]: "Molino Andes", [CARRIER]: "Fletes Ruta 5" };
const UNIT = 10_000_000;
// In a circle of three the business looking deals with both others, so it knows every party by name.
const party = (address: string, owes: number, owed: number, signed: boolean) => ({
  address,
  known: true,
  owesLess: String(owes * UNIT),
  owedLess: String(owed * UNIT),
  net: String((owed - owes) * UNIT),
  signed,
});

/** The circle of the pitch at each moment of its life: found, being signed by one more party each time, settled. */
function moment(step: number): CircleView {
  const signed = (order: number) => step > order;
  return {
    key: "demo",
    clearings: [],
    parties: [party(BAKERY, 100, 90, signed(1)), party(MILL, 80, 100, signed(0)), party(CARRIER, 90, 80, signed(2))],
    edges: [
      { from: BAKERY, to: MILL, amount: String(100 * UNIT) },
      { from: MILL, to: CARRIER, amount: String(80 * UNIT) },
      { from: CARRIER, to: BAKERY, amount: String(90 * UNIT) },
    ],
    cleared: String(270 * UNIT),
    moved: String(20 * UNIT),
    proposal: step === 0 ? undefined : { id: "demo", status: step > 3 ? "settled" : "open", expirationLedger: 0 },
  };
}

const nameOf = (address: string) => NAMES[address] ?? "";

/** What each party of the circle sees beside its name, from the bakery's side of the books. */
function wordsFor(address: string, settled: boolean): string {
  if (address === BAKERY) return netInWords(BigInt(-10 * UNIT), settled);
  if (address === MILL) return `${settled ? "le debías" : "le debes"} 100`;
  return `${settled ? "te debía" : "te debe"} 90`;
}

const CAPTIONS = [
  "Tres negocios se deben en círculo: 270 en deudas.",
  "Cada uno firma solo su parte.",
  "Cada uno firma solo su parte.",
  "Con la última firma, una sola transacción lo liquida.",
  "270 cancelados moviendo solo 20.",
];
const PACE_MS = [2600, 1300, 1300, 1500, 3400];

/** The idea, playing: a circle of debts gets found, signed and untied, over and over. */
export function Demonstration() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const next = setTimeout(() => setStep((step + 1) % CAPTIONS.length), PACE_MS[step]);
    return () => clearTimeout(next);
  }, [step]);
  const circle = moment(step);
  const settled = circle.proposal?.status === "settled";

  return (
    <figure className="relative isolate overflow-hidden rounded-3xl border border-hairline bg-canvas-soft">
      <Bloom
        color={step > 3 ? INK.free.bloom : INK.credit.bloom}
        className="left-[58%] top-[44%] -z-10 size-[80%] -translate-x-1/2 -translate-y-1/2 opacity-75"
      />
      <Bloom color={INK.debt.bloom} className="left-[4%] top-[52%] -z-10 size-[52%] opacity-55" />
      <Bloom color={INK.neutral.bloom} className="left-[52%] top-[-8%] -z-10 size-[46%] opacity-50" />
      <div className="hidden justify-center px-2 pt-6 sm:flex">
        <CircleGraph circle={circle} me={BAKERY} nameOf={nameOf} />
      </div>
      {/* On a phone the names do not fit beside the nodes, so they go in a list below. */}
      <div className="px-4 pt-4 sm:hidden">
        <CircleGraph circle={circle} me={BAKERY} nameOf={nameOf} labels={false} />
        <ul className="mt-1 flex flex-col gap-2.5 pb-4 text-sm">
          {circle.parties.map((party) => (
            <li key={party.address} className="flex items-center gap-3">
              <Avatar name={nameOf(party.address)} size="sm" tone={party.address === BAKERY ? "ink" : "neutral"} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {nameOf(party.address)}
                {party.address === BAKERY && " (tú)"}
              </span>
              <span className="text-muted tabular-nums">{wordsFor(party.address, settled)}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="flex min-h-16 items-center justify-between gap-4 border-t border-hairline bg-card/75 px-7 py-4 text-sm text-body">
        <span>{CAPTIONS[step]}</span>
        <span className="flex gap-1" aria-hidden>
          {CAPTIONS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 w-4 rounded-full transition-colors ${index === step ? "bg-primary" : "bg-hairline-strong"}`}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
