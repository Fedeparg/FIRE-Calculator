CREATE TABLE "fx_reference_coverage" (
	"currency" varchar(3) PRIMARY KEY NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_reference_rates" (
	"currency" varchar(3) NOT NULL,
	"date" date NOT NULL,
	"units_per_eur" numeric(20, 8) NOT NULL,
	"source" varchar(10) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_reference_rates_currency_date_pk" PRIMARY KEY("currency","date")
);
