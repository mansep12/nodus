"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SessionProvider, useSession } from "@/lib/session";
import { Dashboard } from "./dashboard";
import { Welcome } from "./welcome";

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Screen />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function Screen() {
  const { ready, session } = useSession();
  if (!ready) return <main className="grid min-h-screen place-items-center text-muted">Abriendo Nodus…</main>;
  return session ? <Dashboard address={session.address} /> : <Welcome />;
}
