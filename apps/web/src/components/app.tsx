"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { explain } from "@/lib/actions";
import { SessionLost } from "@/lib/api";
import { useNodusState } from "@/lib/hooks";
import { NodusProvider } from "@/lib/nodus";
import { SessionProvider, useSession } from "@/lib/session";
import { Shell } from "./shell";
import { Button, Knot, Logo, Problem } from "./ui";
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
  const { ready, session, confirming } = useSession();
  if (!ready) return <Waiting>Abriendo Nodus…</Waiting>;
  if (session) return <Business>{children}</Business>;
  if (confirming) return <Confirm />;
  return <Welcome />;
}

/** The pages of a business, once its debts have been read. */
function Business({ children }: { children: React.ReactNode }) {
  const { leave, expire } = useSession();
  const { data: state, error } = useNodusState();
  useEffect(() => {
    if (error instanceof SessionLost) expire();
  }, [error, expire]);
  if (!state)
    return <Waiting>{error && !(error instanceof SessionLost) ? <Problem>{error.message}</Problem> : "Leyendo las deudas…"}</Waiting>;
  return (
    <NodusProvider state={state} leave={leave}>
      <Shell>{children}</Shell>
    </NodusProvider>
  );
}

/** The browser still holds the passkey, but the session with Nodus ended: one touch opens it again. */
function Confirm() {
  const { confirm, leave } = useSession();
  const confirmation = useMutation({ mutationFn: confirm });
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Logo className="text-title" />
        <p className="display text-3xl">Confirma que eres tú.</p>
        <p className="text-body">Tu sesión con Nodus terminó. Tu passkey sigue en este dispositivo: tócala para volver a entrar.</p>
        <Button busy={confirmation.isPending} onClick={() => confirmation.mutate()}>
          Entrar con mi passkey
        </Button>
        <Button variant="quiet" onClick={leave}>
          Salir
        </Button>
        {confirmation.error && <Problem>{explain(confirmation.error)}</Problem>}
      </div>
    </main>
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
