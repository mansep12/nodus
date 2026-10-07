ALTER TYPE "public"."obligation_status" ADD VALUE 'rejected' BEFORE 'settled';--> statement-breakpoint
ALTER TYPE "public"."obligation_status" ADD VALUE 'expired';--> statement-breakpoint
CREATE TABLE "candidates" (
	"contract_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"cut_short" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"public_key" text NOT NULL,
	"context_rule_id" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"birth_wasm_hash" text,
	"creation_transaction_hash" text,
	"creation_ledger" integer,
	"birth_constructor_args_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"credential_id" text,
	"public_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "paid" numeric(39, 0) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "obligations" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "credentials_by_address" ON "credentials" USING btree ("address");--> statement-breakpoint
CREATE INDEX "invitations_by_address" ON "invitations" USING btree ("address");--> statement-breakpoint
CREATE INDEX "push_subscriptions_by_address" ON "push_subscriptions" USING btree ("address");--> statement-breakpoint
CREATE INDEX "events_by_type" ON "events" USING btree ("contract_id","type");--> statement-breakpoint
CREATE INDEX "events_by_tx" ON "events" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "obligations_by_status" ON "obligations" USING btree ("contract_id","status");--> statement-breakpoint
CREATE INDEX "obligations_by_debtor" ON "obligations" USING btree ("contract_id","debtor");--> statement-breakpoint
CREATE INDEX "obligations_by_creditor" ON "obligations" USING btree ("contract_id","creditor");--> statement-breakpoint
CREATE INDEX "proposals_by_status" ON "proposals" USING btree ("contract_id","status");