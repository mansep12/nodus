/**
 * What the API returns. Amounts are decimal strings in the token's smallest
 * unit. Everything is seen from one business: its own debts, the circles it
 * is part of, and the other businesses only as far as it deals with them.
 */

export type ObligationStatus = "pending" | "accepted" | "cancelled" | "rejected" | "settled" | "expired";

export type Role = "owner" | "clerk";

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
  /** What the debtor paid directly, outside settlements. */
  paid: string;
  status: ObligationStatus;
  registeredAt: string;
  /** When it falls due, if agreed. */
  dueAt: string | null;
  /** Hash of the document behind it, as hex, if the creditor gave one. */
  reference: string | null;
  /** What the reference stands for, when a party wrote it down and it matches the hash. */
  note: string | null;
}

export interface PartyView {
  /**
   * The business's address when the viewer deals with it; otherwise an opaque
   * marker, different on every read, that only says whether it has signed.
   */
  address: string;
  /** Whether the viewer may know who this is: itself, or one it deals with. */
  known: boolean;
  /** Debt it stops owing. Zero for parties the viewer does not know. */
  owesLess: string;
  /** Credit it stops being owed. Zero for parties the viewer does not know. */
  owedLess: string;
  /** Receives it when positive, pays it when negative. Zero for parties the viewer does not know. */
  net: string;
  signed: boolean;
}

export interface EdgeView {
  from: string;
  to: string;
  /** The amount, only for the debts the viewer is part of. */
  amount: string | null;
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

/** What the whole network has done, without saying who. */
export interface NetworkStats {
  businesses: number;
  settlements: number;
  cleared: string;
  moved: string;
}

export interface MeView {
  address: string;
  /** Null until the business names itself. */
  name: string | null;
  role: Role;
}

export interface StateView {
  /** The Nodus contract and the token it settles in. */
  contract: string;
  token: string;
  ledger: number;
  /** When the copy of the contract was last brought up to date. */
  syncedAt: string;
  me: MeView;
  /** The viewer and the businesses it deals with. */
  businesses: BusinessView[];
  /** The viewer's debts, on both sides. */
  obligations: ObligationView[];
  /** The circles the viewer is part of. */
  circles: CircleView[];
  /** Whether the search for circles stopped before looking at every one. */
  cutShort: boolean;
  /** The viewer's most recent settlements; `settlementsTotal` says how many there are. */
  settlements: SettlementView[];
  settlementsTotal: number;
  network: NetworkStats;
  /** Token balance of the viewer. */
  balance: string | null;
  /** Whether this installation hands out test tokens. */
  faucet: boolean;
  /** Whether this installation can send notifications; its public key when it can. */
  push: string | null;
}

/** What a party must sign to join a settlement. */
export interface SigningRequest {
  proposalId: string;
  /** The party's unsigned authorization entry, as base64 XDR. */
  entry: string;
  expirationLedger: number;
}

/**
 * A passkey of an account, as the smart account kit needs it to connect from
 * a browser that did not create the account. Public keys are hex.
 */
export interface KitCredential {
  credentialId: string;
  publicKey: string;
  contractId: string;
  contextRuleId: number;
  isPrimary: boolean;
  label: string;
  birthWasmHash?: string;
  creationTransactionHash?: string;
  creationLedger?: number;
  birthConstructorArgsHash?: string;
}

/** What opening a session returns. */
export interface SessionView {
  address: string;
  name: string | null;
  role: Role;
  credentialId: string;
  /** Whether it is an example business: made up for trying the app, with neighbours the server answers for. */
  example: boolean;
  /** Every passkey of the account, to let the kit connect with the one that signed. */
  credentials: KitCredential[];
}

/** What a browser needs to enter as an example business: its test passkey, to keep in its own storage. */
export interface ExampleEntry {
  address: string;
  name: string;
  credentialId: string;
  privateKey: JsonWebKey;
}

export interface InvitationView {
  id: string;
  role: Role;
  label: string;
  status: "pending" | "registered" | "added" | "revoked";
  expiresAt: string;
  /** Present once the invitee registered a passkey. */
  credentialId?: string;
  publicKey?: string;
}

/** The passkeys and pending invitations of an account. */
export interface TeamView {
  credentials: Array<{
    credentialId: string;
    label: string;
    contextRuleId: number;
    role: Role;
    isPrimary: boolean;
    createdAt: string;
    /** The passkey of the current session. */
    current: boolean;
  }>;
  invitations: InvitationView[];
}

/** A business found by name in the directory. */
export interface DirectoryMatch {
  address: string;
  name: string;
}
