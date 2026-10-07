"use client";

import { createContext, useContext, useMemo } from "react";
import { shortAddress } from "./format";
import type { Role, StateView } from "./types";

interface Nodus {
  /** The latest state of Nodus. */
  state: StateView;
  /** The smart account of the business looking at it. */
  me: string;
  /** What the session may do: everything, or only keep the books. */
  role: Role;
  nameOf: (address: string) => string;
  /** Where the pages of the app hang from: "" in the app itself. */
  base: string;
  leave: () => void;
}

const NodusContext = createContext<Nodus | null>(null);

interface ProviderProps {
  state: StateView;
  base?: string;
  leave: () => void;
  children: React.ReactNode;
}

/** Gives the pages of a business the state they show and who is looking. */
export function NodusProvider({ state, base = "", leave, children }: ProviderProps) {
  const value = useMemo(() => {
    const names = new Map(state.businesses.map((business) => [business.address, business.name]));
    const nameOf = (address: string) => names.get(address) ?? (address.startsWith("anon:") ? "Otro negocio" : shortAddress(address));
    return { state, me: state.me.address, role: state.me.role, base, leave, nameOf };
  }, [state, base, leave]);
  return <NodusContext.Provider value={value}>{children}</NodusContext.Provider>;
}

export function useNodus(): Nodus {
  const value = useContext(NodusContext);
  if (!value) throw new Error("useNodus needs a NodusProvider");
  return value;
}
