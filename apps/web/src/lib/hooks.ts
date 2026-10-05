"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { explain } from "./actions";
import { fetchState } from "./api";

const stateKey = (address: string | null) => ["state", address];

/** The state of Nodus, re-read every few seconds so that others' actions show up. */
export function useNodusState(address: string | null) {
  return useQuery({ queryKey: stateKey(address), queryFn: () => fetchState(address), refetchInterval: 3_000 });
}

/**
 * Runs something that changes the chain, then shows its effect right away.
 * `error` is already worded for the person using the app.
 */
export function useAction<Input>(address: string | null, action: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: action,
    onSettled: async () => queryClient.setQueryData(stateKey(address), await fetchState(address, true)),
  });
  return { ...mutation, error: mutation.error ? explain(mutation.error) : null };
}
