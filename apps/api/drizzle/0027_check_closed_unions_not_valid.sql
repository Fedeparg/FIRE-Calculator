-- CHECK de las uniones cerradas y de los importes de los lotes, como NOT VALID: se aplican a
-- toda fila nueva o modificada, pero no se comprueban las existentes (no hemos podido revisar los
-- datos de producción). Tras confirmar que no hay filas fuera de rango, validarlas a mano con
-- `ALTER TABLE … VALIDATE CONSTRAINT …` (ver el PR de la auditoría de calidad).
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_kind_check" CHECK ("income_events"."kind" in ('dividend', 'interest', 'benefit')) NOT VALID;--> statement-breakpoint
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_source_check" CHECK ("income_events"."source" in ('manual', 'trade_republic')) NOT VALID;--> statement-breakpoint
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_gross_source_check" CHECK ("income_events"."gross_source" in ('broker', 'derived', 'market', 'estimate', 'manual')) NOT VALID;--> statement-breakpoint
ALTER TABLE "income_events" ADD CONSTRAINT "income_events_withholding_origin_source_check" CHECK ("income_events"."withholding_origin_source" is null or "income_events"."withholding_origin_source" in ('broker', 'derived', 'market', 'estimate', 'manual')) NOT VALID;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_kind_check" CHECK ("position_lots"."kind" in ('buy', 'sell')) NOT VALID;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_quantity_check" CHECK ("position_lots"."quantity" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_price_check" CHECK ("position_lots"."price" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_fees_check" CHECK ("position_lots"."fees" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_asset_class_check" CHECK ("positions"."asset_class" is null or "positions"."asset_class" in ('stock', 'fund', 'derivative', 'other')) NOT VALID;--> statement-breakpoint
ALTER TABLE "savings_pending_balances" ADD CONSTRAINT "savings_pending_balances_kind_check" CHECK ("savings_pending_balances"."kind" in ('gains', 'capitalIncome')) NOT VALID;