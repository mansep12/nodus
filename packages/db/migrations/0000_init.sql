CREATE TYPE "public"."obligation_status" AS ENUM('pending', 'accepted', 'cancelled', 'settled');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('open', 'submitted', 'settled', 'failed');--> statement-breakpoint
CREATE TABLE "authorizations" (
	"proposal_id" text NOT NULL,
	"address" text NOT NULL,
	"entry" text NOT NULL,
	"signed_entry" text,
	"signed_at" timestamp with time zone,
	CONSTRAINT "authorizations_proposal_id_address_pk" PRIMARY KEY("proposal_id","address")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"address" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursors" (
	"contract_id" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"type" text NOT NULL,
	"obligation_id" bigint,
	"data" jsonb NOT NULL,
	"ledger" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"closed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"contract_id" text NOT NULL,
	"id" bigint NOT NULL,
	"creditor" text NOT NULL,
	"debtor" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"original_amount" numeric(39, 0) NOT NULL,
	"status" "obligation_status" NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "obligations_contract_id_id_pk" PRIMARY KEY("contract_id","id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"key" text NOT NULL,
	"clearings" jsonb NOT NULL,
	"func" text NOT NULL,
	"expiration_ledger" integer NOT NULL,
	"status" "proposal_status" DEFAULT 'open' NOT NULL,
	"tx_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_under_way" ON "proposals" USING btree ("contract_id","key") WHERE "proposals"."status" in ('open', 'submitted');