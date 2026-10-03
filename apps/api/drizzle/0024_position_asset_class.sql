ALTER TABLE "positions" ADD COLUMN "asset_class" varchar(12);--> statement-breakpoint
-- Los derivados ya se conocían: el resto queda sin clasificar hasta reimportar o editar.
UPDATE "positions" SET "asset_class" = 'derivative' WHERE "is_derivative" = true;