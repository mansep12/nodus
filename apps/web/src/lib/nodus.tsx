"use client";

import { createContext, useContext, useMemo } from "react";
import { shortAddress } from "./format";
import type { StateView } from "./types";

interface Nodus {
  /** The latest state of Nodus. */
  state: StateView;
  /** The smart account of the business looking at it. */
  me: string;
  nameOf: (address: string) => string;
  /** Where the pages of the app hang from: "" in the app itself. */
  base: string;
  leave: () => void;
}

const NodusContext = createContext<Nodus | null>(null);

interface ProviderProps {
  state: StateView;
  me: string;
  base?: string;
  leave: () => void;
  children: React.ReactNode;
}

/** Gives the pages of a business the state they show and who is looking. */
export function NodusProvider({ state, me, base = "", leave, children }: ProviderProps) {
  const value = useMemo(() => {
    const names = new Map(state.businesses.map((business) => [business.address, business.name]));
    return { state, me, base, leave, nameOf: (address: string) => names.get(address) ?? shortAddress(address) };
  }, [state, me, base, leave]);
  return <NodusContext.Provider value={value}>{children}</NodusContext.Provider>;
}

export function useNodus(): Nodus {
  const value = useContext(NodusContext);
  if (!value) throw new Error("useNodus needs a NodusProvider");
  return value;
}
