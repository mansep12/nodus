"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FOCUS, SCENARIOS, type Scenario } from "@/lib/fixtures";
import { RehearsalContext } from "@/lib/hooks";
import { NodusProvider } from "@/lib/nodus";
import { Shell } from "./shell";
import { segment } from "./ui";
import { WelcomeScreen } from "./welcome";

/**
 * The pages of a business with made-up data, to look at the design without
 * accounts or a network. Nothing here signs or sends anything.
 */
export function Preview({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [scenario, setScenario] = useState<Scenario>("completa");
  const state = useMemo(() => SCENARIOS[scenario].build(), [scenario]);
  const leave = useCallback(() => {}, []);

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <RehearsalContext.Provider value={true}>
          <NodusProvider state={state} me={FOCUS.address} base="/muestra" leave={leave}>
            <Shell>{children}</Shell>
          </NodusProvider>
        </RehearsalContext.Provider>
      </QueryClientProvider>

      <aside className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-hairline bg-card p-1 text-sm shadow-lift">
          <span className="eyebrow whitespace-nowrap px-3 !text-[10.5px] text-muted">Muestra · datos ficticios</span>
          {(Object.keys(SCENARIOS) as Scenario[]).map((key) => (
            <button
              key={key}
              aria-pressed={scenario === key}
              onClick={() => setScenario(key)}
              className={`${segment(scenario === key)} whitespace-nowrap ${scenario === key ? "!bg-primary !text-white" : ""}`}
            >
              {SCENARIOS[key].label}
            </button>
          ))}
          <Link href="/muestra/bienvenida" className={`${segment(false)} whitespace-nowrap`}>
            Bienvenida
          </Link>
        </div>
      </aside>
    </MotionConfig>
  );
}

/** The welcome screen, going nowhere. */
export function WelcomePreview() {
  const [busy, setBusy] = useState(false);
  const pretend = () => {
    setBusy(true);
    setTimeout(() => setBusy(false), 1_100);
  };
  return (
    <MotionConfig reducedMotion="user">
      <WelcomeScreen onCreate={pretend} creating={busy} onEnter={pretend} entering={false} problem={null} testPasskeys={null} />
      <aside className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
        <Link
          href="/muestra"
          className="eyebrow rounded-full border border-hairline bg-card px-4 py-2.5 !text-[10.5px] text-muted shadow-lift hover:text-ink"
        >
          Muestra · volver a las pantallas del negocio
        </Link>
      </aside>
    </MotionConfig>
  );
}
