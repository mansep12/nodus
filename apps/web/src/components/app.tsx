"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { useNodusState } from "@/lib/hooks";
import { NodusProvider } from "@/lib/nodus";
import { SessionProvider, useSession } from "@/lib/session";
import { Shell } from "./shell";
import { Knot, Problem } from "./ui";
import { Welcome } from "./welcome";

/** The app around its pages: who is using it and what they see while that is not known. */
export function App({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Screen>{children}</Screen>
        </SessionProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const { ready, session, leave } = useSession();
  if (!ready) return <Waiting>Abriendo Nodus…</Waiting>;
  if (!session) return <Welcome />;
  return (
    <Business address={session.address} leave={leave}>
      {children}
    </Business>
  );
}

/** The pages of a business, once its debts have been read. */
function Business({ address, leave, children }: { address: string; leave: () => void; children: React.ReactNode }) {
  const { data: state, error } = useNodusState(address);
  if (!state) return <Waiting>{error ? <Problem>{error.message}</Problem> : "Leyendo las deudas…"}</Waiting>;
  return (
    <NodusProvider state={state} me={address} leave={leave}>
      <Shell>{children}</Shell>
    </NodusProvider>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-muted">
        <Knot className="size-9 animate-pulse text-ink" strokeWidth={1.5} />
        {children}
      </div>
    </main>
  );
}
