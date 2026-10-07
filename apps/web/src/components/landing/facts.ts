import { EXPLORER_URL } from "@nodus/stellar";

/*
 * What the page is allowed to claim: the example of the README and what was
 * tried on the test network. There are no customers, figures of use or
 * testimonials, and the page says none.
 */

export const REPO_URL = "https://github.com/mansep12/nodus";
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const HACKATHON = "Find Your Way";

/** The circle of the pitch: A owes B 100, B owes C 80, C owes A 90. */
export const EXAMPLE = {
  /** Settling in full cancels every debt and moves the nets. */
  cleared: 270,
  moved: 20,
  /** Settling without money cancels only what the debts have in common. */
  clearedWithoutMoney: 240,
  /** What is left owed afterwards, by A and by C. */
  leftOver: [20, 10],
};

export interface Transaction {
  hash: string;
  url: string;
  title: string;
  text: string;
  /** What else was measured, if anything. */
  note?: string;
}

const transaction = (hash: string, title: string, text: string, note?: string): Transaction => ({
  hash,
  url: `${EXPLORER_URL}/tx/${hash}`,
  title,
  text,
  note,
});

/** The two settlements on testnet that anyone can open. */
export const TRANSACTIONS = {
  twenty: transaction(
    "da968b3a8e5ec4a1008d67e5f6ef1bc9df330bf922fbb0e58862245558039b63",
    "20 negocios, una sola transacción",
    "Un círculo de 20 negocios liquidado de una vez, con las 20 firmas de passkey viajando juntas.",
    "Usó el 33 % del cómputo y el 44 % del tamaño que la red permite por transacción.",
  ),
  three: transaction(
    "a2f068a9bf2dbdf736ddabf5860edcce487f0bf3230af49e246881f819558fdd",
    "3 negocios, sin mover dinero",
    "Un círculo de 3 liquidado desde esta misma aplicación, sin que nadie pagara nada y con la comisión de red pagada por el relayer.",
  ),
};
