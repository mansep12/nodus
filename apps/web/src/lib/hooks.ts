"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { explain } from "./actions";
import { fetchState } from "./api";

const stateKey = (address: string | null) => ["state", address];

/** The state of Nodus, re-read every few seconds so that others' actions show up. */
export function useNodusState(address: string | null) {
  return useQuery({ queryKey: stateKey(address), queryFn: () => fetchState(address), refetchInterval: 3_000 });
}

/**
 * True where the screens are shown with made-up data: actions then only take
 * their time, without signing or sending anything.
 */
export const RehearsalContext = createContext(false);

const REHEARSAL_MS = 1_100;

/**
 * Runs something that changes the chain, then shows its effect right away.
 * `error` is already worded for the person using the app.
 */
export function useAction<Input>(address: string | null, action: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const rehearsal = useContext(RehearsalContext);
  const mutation = useMutation({
    mutationFn: rehearsal ? () => new Promise((resolve) => setTimeout(resolve, REHEARSAL_MS)) : action,
    onSettled: async () => {
      if (!rehearsal) queryClient.setQueryData(stateKey(address), await fetchState(address, true));
    },
  });
  return { ...mutation, error: mutation.error ? explain(mutation.error) : null };
}
