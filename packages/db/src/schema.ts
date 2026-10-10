import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Token amounts are i128 on chain, wider than any Postgres integer type.
const amount = (name: string) => numeric(name, { precision: 39, scale: 0, mode: "bigint" });

/**
 * - `pending`: registered by the creditor, not accepted by the debtor yet.
 * - `accepted`: owed, and able to take part in settlements.
 * - `cancelled`: withdrawn by the creditor.
 * - `rejected`: refused by the debtor before accepting it.
 * - `settled`: cancelled in full by settlements and direct payments.
 * - `expired`: no longer on chain for a reason the indexer did not see.
 */
export const obligationStatus = pgEnum("obligation_status", ["pending", "accepted", "cancelled", "rejected", "settled", "expired"]);

/**
 * A copy of the contract's obligations, kept up to date from its events so
 * that circles can be searched without reading the chain debt by debt.
 * The contract remains the source of truth.
 */
export const obligations = pgTable(
  "obligations",
  {
    contractId: text("contract_id").notNull(),
    id: bigint("id", { mode: "bigint" }).notNull(),
    creditor: text("creditor").notNull(),
    debtor: text("debtor").notNull(),
    /** What is still owed. */
    amount: amount("amount").notNull(),
    originalAmount: amount("original_amount").notNull(),
    /** What the debtor paid directly, outside settlements. */
    paid: amount("paid")
      .notNull()
      .default(sql`0`),
    status: obligationStatus("status").notNull(),
    /** Hash of the document behind the debt, as hex, if the creditor gave one. */
    reference: text("reference"),
    /** When the debt falls due, if agreed. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contractId, table.id] }),
    index("obligations_by_status").on(table.contractId, table.status),
    index("obligations_by_debtor").on(table.contractId, table.debtor),
    index("obligations_by_creditor").on(table.contractId, table.creditor),
  ],
);

/** Every contract event applied so far: the history behind `obligations`. */
export const events = pgTable(
  "events",
  {
    /** The id the RPC gives the event: unique and ordered. */
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    type: text("type").notNull(),
    obligationId: bigint("obligation_id", { mode: "bigint" }),
    /** The event's data, with amounts as decimal strings. */
    data: jsonb("data").$type<Record<string, string | number | null>>().notNull(),
    ledger: integer("ledger").notNull(),
    txHash: text("tx_hash").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("events_by_type").on(table.contractId, table.type), index("events_by_tx").on(table.txHash)],
);

/** Where the indexer left off reading each contract's events. */
export const cursors = pgTable("cursors", {
  contractId: text("contract_id").primaryKey(),
  cursor: text("cursor").notNull(),
});

/**
 * The name each smart account goes by. Identity is not verified: anyone can
 * name an account, so this is a directory for display, not a registry.
 */
export const businesses = pgTable("businesses", {
  address: text("address").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The passkeys that answer for each smart account, as the account's own
 * context rules have them, plus what the smart account kit needs to connect
 * from a browser that did not create the account. Everything here is either
 * on chain already or verifiable against it.
 */
export const credentials = pgTable(
  "credentials",
  {
    /** The WebAuthn credential id, base64url. */
    credentialId: text("credential_id").primaryKey(),
    address: text("address").notNull(),
    /** Uncompressed P-256 public key, 65 bytes as hex. */
    publicKey: text("public_key").notNull(),
    /** The account's context rule the passkey signs under: 0 is the owner's. */
    contextRuleId: integer("context_rule_id").notNull().default(0),
    /** The passkey the account was created with. */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** What the person calls this key: a device, a colleague. */
    label: text("label").notNull().default(""),
    /** The immutable facts of the account's creation, which the kit checks on chain. */
    birthWasmHash: text("birth_wasm_hash"),
    creationTransactionHash: text("creation_transaction_hash"),
    creationLedger: integer("creation_ledger"),
    birthConstructorArgsHash: text("birth_constructor_args_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("credentials_by_address").on(table.address)],
);

/**
 * An invitation to sign for an account with a passkey of one's own: a backup
 * device of the owner, or a colleague with a limited role. The invitee
 * registers a passkey against it; the owner then adds it to the account.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    /** `owner` for a backup key of the owner, `clerk` for a key that cannot sign settlements. */
    role: text("role").notNull(),
    label: text("label").notNull(),
    /** Filled in when the invitee registers a passkey. */
    credentialId: text("credential_id"),
    publicKey: text("public_key"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("invitations_by_address").on(table.address)],
);

/** A nonce handed out for a passkey assertion, consumed when it is used. */
export const challenges = pgTable("challenges", {
  nonce: text("nonce").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fixed-window counters behind the rate limits of the API. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Where a business wants to be told that something waits for it. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    address: text("address").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_by_address").on(table.address)],
);

/** The notifications already sent, so that none is sent twice. */
export const notifications = pgTable("notifications", {
  /** What it was about and to whom: `kind:subject:address`. */
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  kind: text("kind").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The circles the solver last found, so that reads do not run it. */
export const candidates = pgTable("candidates", {
  contractId: text("contract_id").primaryKey(),
  /** Serialized proposals, with amounts and ids as decimal strings. */
  data: jsonb("data").$type<unknown>().notNull(),
  /** Whether the search stopped before looking at every circle. */
  cutShort: boolean("cut_short").notNull().default(false),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What a debt's reference hash stands for, as the creditor wrote it: an
 * invoice number, a contract. The hash on chain commits to this text, so
 * anyone with the text can check it.
 */
export const notes = pgTable(
  "notes",
  {
    contractId: text("contract_id").notNull(),
    obligationId: bigint("obligation_id", { mode: "bigint" }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.contractId, table.obligationId] })],
);

/** When each maintenance job last ran. */
export const jobs = pgTable("jobs", {
  name: text("name").primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
});

export const proposalStatus = pgEnum("proposal_status", ["open", "submitted", "settled", "failed"]);

/**
 * A settlement that is gathering the signatures of its parties. It carries
 * no authority: what gets executed is only what every party signs.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    /** Identifies the set of clearings, to find the proposal under way for a circle. */
    key: text("key").notNull(),
    clearings: jsonb("clearings").$type<Array<{ id: string; amount: string }>>().notNull(),
    /** The `settle` invocation every party authorizes, as base64 XDR. */
    func: text("func").notNull(),
    /** Ledger after which the signatures are no longer valid. */
    expirationLedger: integer("expiration_ledger").notNull(),
    status: proposalStatus("status").notNull().default("open"),
    txHash: text("tx_hash"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Parties must all sign the same proposal, so a circle has at most one under way.
    uniqueIndex("proposals_under_way")
      .on(table.contractId, table.key)
      .where(sql`${table.status} in ('open', 'submitted')`),
    index("proposals_by_status").on(table.contractId, table.status),
  ],
);

/** What each party of a proposal has to sign, and its signature once given. */
export const authorizations = pgTable(
  "authorizations",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    /** The unsigned authorization entry, as base64 XDR. */
    entry: text("entry").notNull(),
    signedEntry: text("signed_entry"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.proposalId, table.address] })],
);

/**
 * A network of businesses made up for someone who wants to try the app
 * without bringing anyone along: an example business with its history, and
 * the neighbours it deals with. Each visitor is handed one of their own.
 */
export const exampleWorlds = pgTable(
  "example_worlds",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When it was handed to a visitor; null while it waits for one. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [index("example_worlds_by_claim").on(table.claimedAt)],
);

/**
 * The accounts of an example world, with the passkey the installation holds
 * for each: the visitor enters as `business`, and the server answers for
 * every `neighbor`. Test keys of made-up businesses, and still kept encrypted.
 */
export const exampleActors = pgTable(
  "example_actors",
  {
    address: text("address").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => exampleWorlds.id, { onDelete: "cascade" }),
    /** `business` for the one the visitor enters as, `neighbor` for the rest. */
    role: text("role").notNull(),
    /** What the neighbour does in the story: `mill`, `carrier`, or null for the others. */
    part: text("part"),
    /** The passkey, as JSON encrypted with a key derived from the session secret. */
    sealedPasskey: text("sealed_passkey").notNull(),
  },
  (table) => [index("example_actors_by_world").on(table.worldId)],
);
