import type { StateView } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudo conectar con Nodus.");
  return data as T;
}

/** Everything the app shows. `fresh` reads the chain first, for right after a transaction. */
export function fetchState(address: string | null, fresh = false): Promise<StateView> {
  const query = new URLSearchParams();
  if (address) query.set("address", address);
  if (fresh) query.set("fresh", "1");
  return request(`/api/state?${query}`);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
