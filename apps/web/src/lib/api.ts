import type { SessionView, StateView } from "./types";

/** The API refused the request because the browser has no session, or not the right one. */
export class SessionLost extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new SessionLost(data?.error ?? "Tu sesión terminó. Entra de nuevo.");
  if (!response.ok) throw new Error(data?.error ?? "No se pudo conectar con Nodus.");
  return data as T;
}

/** Everything the app shows. `fresh` reads the chain first, for right after a transaction. */
export function fetchState(fresh = false): Promise<StateView> {
  return request(`/api/state${fresh ? "?fresh=1" : ""}`);
}

export function get<T>(path: string): Promise<T> {
  return request(path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return request(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function del<T>(path: string, body?: unknown): Promise<T> {
  return request(path, {
    method: "DELETE",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The session the API has for this browser, if any. */
export function fetchSession(): Promise<{ session: Pick<SessionView, "address" | "name" | "role" | "credentialId"> | null }> {
  return request("/api/session");
}
