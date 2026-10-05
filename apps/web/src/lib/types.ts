/** What the API returns. Amounts are decimal strings in the token's smallest unit. */

export type ObligationStatus = "pending" | "accepted" | "cancelled" | "settled";

export interface BusinessView {
  address: string;
  name: string;
}

export interface ObligationView {
  id: string;
  debtor: string;
  creditor: string;
  /** What is still owed. */
  amount: string;
  originalAmount: string;
  status: ObligationStatus;
  registeredAt: string;
}

export interface PartyView {
  address: string;
  /** Debt it stops owing. */
  owesLess: string;
  /** Credit it stops being owed. */
  owedLess: string;
  /** Receives it when positive, pays it when negative. */
  net: string;
  signed: boolean;
}

export interface EdgeView {
  from: string;
  to: string;
  amount: string;
}

/** One way of settling a circle: what it cancels and what that means for each party. */
export interface SettlementOption {
  /** Identifies the set of clearings. */
  key: string;
  clearings: Array<{ id: string; amount: string }>;
  /** In the order the debts chain around the circle. */
  parties: PartyView[];
  edges: EdgeView[];
  cleared: string;
  moved: string;
}

/** A circle of debts, settled in full unless the parties choose `netOnly`. */
export interface CircleView extends SettlementOption {
  /**
   * The same circle settled without moving money: it cancels only what the
   * debts have in common. Offered while nobody has started signing, and only
   * when it differs from settling in full.
   */
  netOnly?: SettlementOption;
  /** Present once someone has started signing it. */
  proposal?: {
    id: string;
    status: "open" | "submitted" | "settled" | "failed";
    expirationLedger: number;
    txHash?: string;
    error?: string;
  };
}

/** A settlement that happened, with the transaction that proves it. */
export interface SettlementView {
  txHash: string;
  closedAt: string;
  circle: CircleView;
}

export interface StateView {
  /** The Nodus contract and the token it settles in. */
  contract: string;
  token: string;
  ledger: number;
  businesses: BusinessView[];
  obligations: ObligationView[];
  circles: CircleView[];
  settlements: SettlementView[];
  /** Token balance of the requested address, when one was given. */
  balance: string | null;
  /** Whether this installation hands out test tokens. */
  faucet: boolean;
}

/** What a party must sign to join a settlement. */
export interface SigningRequest {
  proposalId: string;
  /** The party's unsigned authorization entry, as base64 XDR. */
  entry: string;
  expirationLedger: number;
}
