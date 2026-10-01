CREATE TABLE "instrument_split_checks" (
	"symbol" varchar(40) PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
