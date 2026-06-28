CREATE TABLE "instruments" (
	"query" varchar(40) PRIMARY KEY NOT NULL,
	"symbol" varchar(40),
	"source" varchar(20) NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
