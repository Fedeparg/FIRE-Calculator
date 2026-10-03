CREATE TABLE "savings_pending_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin_year" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_pending_balances" ADD CONSTRAINT "savings_pending_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_pending_balances_user_year_kind_idx" ON "savings_pending_balances" USING btree ("user_id","origin_year","kind");