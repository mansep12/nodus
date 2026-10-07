CREATE TABLE "notes" (
	"contract_id" text NOT NULL,
	"obligation_id" bigint NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_contract_id_obligation_id_pk" PRIMARY KEY("contract_id","obligation_id")
);
