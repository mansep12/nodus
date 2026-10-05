import { sql } from "drizzle-orm";
import {
  bigint,
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

export const obligationStatus = pgEnum("obligation_status", ["pending", "accepted", "cancelled", "settled"]);

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
    status: obligationStatus("status").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.contractId, table.id] })],
);

/** Every contract event applied so far: the history behind `obligations`. */
export const events = pgTable("events", {
  /** The id the RPC gives the event: unique and ordered. */
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  type: text("type").notNull(),
  obligationId: bigint("obligation_id", { mode: "bigint" }),
  /** The event's data, with amounts as decimal strings. */
  data: jsonb("data").$type<Record<string, string | number>>().notNull(),
  ledger: integer("ledger").notNull(),
  txHash: text("tx_hash").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
});

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
