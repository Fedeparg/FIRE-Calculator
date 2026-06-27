ALTER TABLE "positions" ALTER COLUMN "broker" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "positions_user_ticker_broker_idx" ON "positions" USING btree ("user_id","ticker","broker");