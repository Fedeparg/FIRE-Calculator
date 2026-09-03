CREATE TABLE "portfolio_snapshots" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"invested" numeric(20, 8) NOT NULL,
	"market_value" numeric(20, 8) NOT NULL,
	"valued_positions" integer NOT NULL,
	"total_positions" integer NOT NULL,
	"fx_rates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_snapshots_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "position_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(4) NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"fees" numeric(18, 6) DEFAULT '0' NOT NULL,
	"traded_at" date NOT NULL,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_lots" ADD CONSTRAINT "position_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_scenarios" ADD CONSTRAINT "saved_scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "position_lots_position_id_idx" ON "position_lots" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "position_lots_user_id_idx" ON "position_lots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "position_lots_traded_at_idx" ON "position_lots" USING btree ("traded_at");--> statement-breakpoint
CREATE INDEX "saved_scenarios_user_id_idx" ON "saved_scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_scenarios_user_slug_idx" ON "saved_scenarios" USING btree ("user_id","slug");--> statement-breakpoint
-- BACKFILL: un lote 'buy' por cada posición ya existente, para que el histórico arranque
-- CUADRADO con la foto actual (cantidad = compras − ventas; precio medio = media ponderada
-- de las compras vivas). Sin esto, una posición antigua tendría cero lotes y el primer
-- recálculo la pondría a cero.
--
-- `traded_at`: la fecha de alta de la posición es lo más cercano a la fecha real de compra
-- que tenemos. Se convierte con `AT TIME ZONE 'UTC'` a propósito: un `::date` directo sobre
-- un `timestamptz` depende de la zona horaria de la SESIÓN que aplique la migración, y eso
-- haría el resultado no determinista entre el runner de CI y el servidor.
--
-- `NOT EXISTS`: la tabla se acaba de crear, así que hoy es siempre verdadero; está por
-- idempotencia defensiva (si alguna vez se reejecutase el bloque, no duplicaría lotes).
INSERT INTO "position_lots" ("position_id", "user_id", "kind", "quantity", "price", "fees", "traded_at")
SELECT p."id", p."user_id", 'buy', p."quantity", p."avg_price", 0, (p."created_at" AT TIME ZONE 'UTC')::date
FROM "positions" p
WHERE NOT EXISTS (SELECT 1 FROM "position_lots" l WHERE l."position_id" = p."id");
