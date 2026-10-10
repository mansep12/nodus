/** What the demo scripts keep between runs, per instance of the app, in pitch/out/demo/vecinos.json. Test keys only. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SavedBusiness, SavedKey } from "./app.ts";

const FILE = new URL("../../../pitch/out/demo/vecinos.json", import.meta.url);

export interface Kept {
  mill?: SavedBusiness;
  carrier?: SavedBusiness;
  /** The address of the business made by hand. */
  you?: string;
  extras?: Record<string, SavedBusiness>;
  /** The business itself, when a script made it (`CREAR=1`) instead of a person. */
  bakery?: SavedBusiness;
  /** A second passkey of the business made by hand, for the scripts to sign as it (`llave.ts`). */
  key?: SavedKey;
  /** What was already done to make its network look like one, so that a new run does not do it twice. */
  seeded?: string[];
}

/** What is kept for the app at `url`, and how to write it down after changing it. */
export function keptFor(url: string): { mine: Kept; remember: () => void } {
  const read = (): Record<string, Kept> => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
  const mine = read()[url] ?? {};
  // Another script may be writing what it keeps for another instance: only this one's part is replaced.
  const remember = () => {
    mkdirSync(new URL(".", FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ ...read(), [url]: mine }, null, 2));
  };
  return { mine, remember };
}
