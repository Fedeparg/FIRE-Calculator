CREATE TABLE "instrument_prices" (
	"symbol" varchar(40) NOT NULL,
	"date" date NOT NULL,
	"close" numeric(20, 8) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"source" varchar(20) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_prices_symbol_date_pk" PRIMARY KEY("symbol","date")
);
