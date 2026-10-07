"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useSyncExternalStore } from "react";
import { explain } from "./actions";
import { SessionLost, fetchState } from "./api";

export const STATE_KEY = ["state"];

/** The state of Nodus, re-read every few seconds so that others' actions show up. */
export function useNodusState(enabled = true) {
  return useQuery({
    queryKey: STATE_KEY,
    queryFn: () => fetchState(),
    enabled,
    refetchInterval: 3_000,
    retry: (failures, error) => !(error instanceof SessionLost) && failures < 2,
  });
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
export function useAction<Input>(action: (input: Input) => Promise<unknown>, options: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();
  const rehearsal = useContext(RehearsalContext);
  const mutation = useMutation({
    mutationFn: rehearsal ? () => new Promise((resolve) => setTimeout(resolve, REHEARSAL_MS)) : action,
    onSuccess: options.onSuccess,
    onSettled: async () => {
      if (!rehearsal) queryClient.setQueryData(STATE_KEY, await fetchState(true).catch(() => undefined));
    },
  });
  return { ...mutation, error: mutation.error ? explain(mutation.error) : null };
}

const nothing = () => () => {};

/** Whether the viewport matches `query`. False until the page has mounted. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return nothing();
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}

/** The origin the app is served from, for links that leave the page. Empty until mounted. */
export function useOrigin(): string {
  return useSyncExternalStore(
    nothing,
    () => window.location.origin,
    () => "",
  );
}
