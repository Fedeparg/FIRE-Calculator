CREATE TABLE "instrument_splits" (
	"symbol" varchar(40) NOT NULL,
	"date" date NOT NULL,
	"ratio" numeric(20, 8) NOT NULL,
	CONSTRAINT "instrument_splits_symbol_date_pk" PRIMARY KEY("symbol","date")
);
