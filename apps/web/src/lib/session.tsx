"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { post } from "./api";
import { getKit } from "./kit";
import { chooseSoftwarePasskey } from "./software-passkey";

interface Session {
  /** The smart account of the business. */
  address: string;
}

interface SessionContextValue {
  /** False until we know whether this device already has a session. */
  ready: boolean;
  session: Session | null;
  /** Creates a passkey and the smart account it controls. */
  create: (name: string) => Promise<void>;
  /** Enters with a passkey this device already has. */
  enter: (softwareCredentialId?: string) => Promise<void>;
  leave: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    getKit()
      .connectWallet()
      .then((connected) => setSession(connected && { address: connected.contractId }))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, []);

  const create = useCallback(async (name: string) => {
    const wallet = await getKit().createWallet("Nodus", name, { autoSubmit: true });
    if (!wallet.submitResult?.success) throw wallet.submitResult?.error ?? new Error("No se pudo crear la cuenta.");
    await post("/api/businesses", { address: wallet.contractId, name });
    setSession({ address: wallet.contractId });
  }, []);

  const enter = useCallback(async (softwareCredentialId?: string) => {
    if (softwareCredentialId) chooseSoftwarePasskey(softwareCredentialId);
    const connected = await getKit().connectWallet({ fresh: true });
    if (connected) setSession({ address: connected.contractId });
  }, []);

  const leave = useCallback(async () => {
    await getKit().disconnect();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ ready, session, create, enter, leave }), [ready, session, create, enter, leave]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs a SessionProvider");
  return value;
}
