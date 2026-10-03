CREATE TABLE "income_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"position_id" uuid,
	"kind" varchar(10) NOT NULL,
	"paid_at" date NOT NULL,
	"isin" varchar(12),
	"name" varchar(100),
	"country" varchar(2),
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"gross" numeric(18, 6) NOT NULL,
	"withholding_origin" numeric(18, 6),
	"withholding_spain" numeric(18, 6) DEFAULT '0' NOT NULL,
	"reported_to_aeat" boolean DEFAULT false NOT NULL,
	"source" varchar(20) NOT NULL,
	"external_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_events_user_paid_at_idx" ON "income_events" USING btree ("user_id","paid_at");--> statement-breakpoint
CREATE INDEX "income_events_position_id_idx" ON "income_events" USING btree ("position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "income_events_user_external_id_idx" ON "income_events" USING btree ("user_id","external_id") WHERE "income_events"."external_id" is not null;