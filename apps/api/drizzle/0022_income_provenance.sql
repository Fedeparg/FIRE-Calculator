CREATE TABLE "instrument_dividends" (
	"symbol" varchar(40) NOT NULL,
	"ex_date" date NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"currency" varchar(8) NOT NULL,
	CONSTRAINT "instrument_dividends_symbol_ex_date_pk" PRIMARY KEY("symbol","ex_date")
);
--> statement-breakpoint
ALTER TABLE "income_events" ADD COLUMN "gross_source" varchar(10) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_events" ADD COLUMN "withholding_origin_source" varchar(10);--> statement-breakpoint
ALTER TABLE "income_events" ADD COLUMN "quantity" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "income_events" ADD COLUMN "original_amount" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "income_events" ADD COLUMN "original_currency" varchar(3);