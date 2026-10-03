DROP INDEX "position_lots_position_id_idx";--> statement-breakpoint
DROP INDEX "position_lots_traded_at_idx";--> statement-breakpoint
DROP INDEX "positions_user_id_idx";--> statement-breakpoint
DROP INDEX "saved_scenarios_user_id_idx";--> statement-breakpoint
CREATE INDEX "login_tokens_created_at_idx" ON "login_tokens" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "oauth_auth_codes_expires_at_idx" ON "oauth_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_expires_at_idx" ON "oauth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "position_lots_position_order_idx" ON "position_lots" USING btree ("position_id","traded_at","created_at","id");