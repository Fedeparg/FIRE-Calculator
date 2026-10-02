import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  numeric,
  integer,
  smallint,
  boolean,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { IncomeKind, IncomeSource, ValueSource } from '@sextante/core/fiscal/income';
import type { SavingsGroup } from '@sextante/core/fiscal/savings-base';
import type { AssetClass } from '@sextante/core/portfolio/types';

/**
 * Esquema de base de datos (única fuente de verdad); Drizzle genera las migraciones
 * (`pnpm db:generate`). Minimización de datos (RGPD): sin contraseñas, el login es por magic link.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

/**
 * Tokens de magic link. Solo se guarda el hash (SHA-256): el enlace lleva el token en claro y
 * al verificar se busca por hash. De un solo uso (`consumedAt`) y con caducidad (`expiresAt`).
 */
export const loginTokens = pgTable('login_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Posiciones tecleadas por el usuario (sin conexión a bancos). `userId` con cascada (RGPD);
 * `quantity`/`avgPrice` son `numeric(18,6)` (string en Drizzle).
 *
 * Unicidad `(userId, ticker, broker)`: el índice funcional es la barrera de último recurso de la
 * regla del servicio; `lower(coalesce(broker, ''))` lo hace case-insensitive y trata el bróker
 * ausente como '' (dos NULL serían distintos en Postgres y dejarían pasar duplicados).
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Símbolo (p.ej. "IWDA") o ISIN, tal como lo teclea el usuario.
    ticker: varchar('ticker', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // En la divisa de la posición.
    avgPrice: numeric('avg_price', { precision: 18, scale: 6 }).notNull(),
    broker: varchar('broker', { length: 100 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Derivado (knock-out, warrant…): cuenta para plusvalías pero no se valora ni entra en los totales.
    isDerivative: boolean('is_derivative').notNull().default(false),
    // Clase de activo (`AssetClass`): decide el bloque de la declaración. NULL = sin clasificar.
    assetClass: varchar('asset_class', { length: 12 }).$type<AssetClass>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('positions_user_id_idx').on(table.userId),
    uniqueIndex('positions_user_ticker_broker_idx').on(
      table.userId,
      table.ticker,
      sql`lower(coalesce(${table.broker}, ''))`,
    ),
  ],
);

export type Position = typeof positions.$inferSelect;

/**
 * Lotes: cada compra o venta de una posición. Dan el histórico que `positions` (foto) no puede:
 * evolución, rentabilidad por periodo y plusvalías FIFO. `positions.quantity/avgPrice` se
 * recalculan desde ellos en cada mutación (`PositionLotsService.recompute`).
 *
 * `userId` está desnormalizado a propósito: filtra e indexa sin join y deja el borrado RGPD en
 * cascada por doble vía. `tradedAt` es un `date` sin hora, de ahí el orden canónico
 * `(tradedAt, createdAt, id)` de la agregación.
 */
export const positionLots = pgTable(
  'position_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 4 }).$type<PositionLotKind>().notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // Precio y comisiones en la divisa de la posición; las comisiones no entran en el precio medio (se guardan para la fiscalidad).
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
    fees: numeric('fees', { precision: 18, scale: 6 }).notNull().default('0'),
    tradedAt: date('traded_at').notNull(),
    note: varchar('note', { length: 200 }),
    // Id en el bróker con prefijo ("trade-republic:<uuid>"), NULL si es manual: clave de deduplicación al reimportar.
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('position_lots_position_id_idx').on(table.positionId),
    // Único por usuario: dos usuarios pueden importar el mismo id sin colisionar, y un id no
    // puede acabar en dos posiciones del mismo usuario. Parcial: los manuales (NULL) no entran.
    uniqueIndex('position_lots_user_external_id_idx')
      .on(table.userId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index('position_lots_user_id_idx').on(table.userId),
    index('position_lots_traded_at_idx').on(table.tradedAt),
  ],
);

/**
 * Cobros que tributan como rendimientos del capital mobiliario: dividendos, intereses y
 * recompensas del bróker (`@sextante/core/fiscal/income`). Van aparte de los lotes porque no
 * mueven la cantidad de ninguna posición; `positionId` es opcional (un interés de cuenta no tiene
 * posición) y se pone a NULL si la posición se borra: el cobro sigue siendo del ejercicio.
 */
export const incomeEvents = pgTable(
  'income_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 10 }).$type<IncomeKind>().notNull(),
    paidAt: date('paid_at').notNull(),
    isin: varchar('isin', { length: 12 }),
    name: varchar('name', { length: 100 }),
    // País de la fuente (ISO 3166-1 alfa-2), para la doble imposición.
    country: varchar('country', { length: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Íntegro; negativo solo en la anulación de un cobro importado.
    gross: numeric('gross', { precision: 18, scale: 6 }).notNull(),
    // NULL = no se sabe (no es lo mismo que 0).
    withholdingOrigin: numeric('withholding_origin', { precision: 18, scale: 6 }),
    withholdingSpain: numeric('withholding_spain', { precision: 18, scale: 6 }).notNull().default('0'),
    // El pagador ya lo comunicó a la AEAT: puede estar en el borrador.
    reportedToAeat: boolean('reported_to_aeat').notNull().default(false),
    source: varchar('source', { length: 20 }).$type<IncomeSource>().notNull(),
    // De dónde sale cada cifra (`ValueSource`): bróker, deducida, dato de mercado, estimación o manual.
    grossSource: varchar('gross_source', { length: 10 }).$type<ValueSource>().notNull().default('manual'),
    // NULL mientras la retención en origen sea desconocida.
    withholdingOriginSource: varchar('withholding_origin_source', { length: 10 }).$type<ValueSource>(),
    // Datos del bróker que permiten volver a resolver el cobro con datos de mercado más tarde.
    quantity: numeric('quantity', { precision: 18, scale: 6 }),
    originalAmount: numeric('original_amount', { precision: 18, scale: 6 }),
    originalCurrency: varchar('original_currency', { length: 3 }),
    // Como en `position_lots`: "trade-republic:<uuid>", NULL si es manual.
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('income_events_user_paid_at_idx').on(table.userId, table.paidAt),
    index('income_events_position_id_idx').on(table.positionId),
    uniqueIndex('income_events_user_external_id_idx')
      .on(table.userId, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);

export type IncomeEventRow = typeof incomeEvents.$inferSelect;

/**
 * Saldos negativos de la base del ahorro pendientes de compensar que vienen de ejercicios que
 * Sextante no calcula (los copia el usuario de su última declaración, anexo C.3). Los de los
 * ejercicios que sí calcula se arrastran solos (`@sextante/core/fiscal/savings-return`).
 * `amount` es lo pendiente al empezar el primer ejercicio que calcula Sextante.
 */
export const savingsPendingBalances = pgTable(
  'savings_pending_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originYear: integer('origin_year').notNull(),
    // "gains" (ganancias y pérdidas patrimoniales) o "capitalIncome" (capital mobiliario).
    kind: varchar('kind', { length: 16 }).$type<SavingsGroup>().notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('savings_pending_balances_user_year_kind_idx').on(table.userId, table.originYear, table.kind),
  ],
);

export type PositionLotKind = 'buy' | 'sell';

export type PositionLot = typeof positionLots.$inferSelect;

/**
 * Foto diaria del valor de la cartera (la evolución se lee de aquí: los precios de lo ya
 * vendido no bastarían para reconstruir cada día). `invested` y `marketValue` van siempre en
 * EUR; `fxRates` guarda las tasas del día (USD por unidad, USD = 1) para reexpresar la serie:
 * EUR→X es `importe * fxRates.EUR / fxRates.X`. PK `(userId, date)`: upsert idempotente.
 */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Fecha del snapshot (UTC), no la del precio: en fin de semana se repite el último cierre.
    date: date('date').notNull(),
    /** Coste de las posiciones valoradas ese día, en EUR (`numeric(20,8)`, como `instrument_prices.close`). */
    invested: numeric('invested', { precision: 20, scale: 8 }).notNull(),
    marketValue: numeric('market_value', { precision: 20, scale: 8 }).notNull(),
    /** Posiciones que se pudieron valorar (había precio y FX convertible). */
    valuedPositions: integer('valued_positions').notNull(),
    /** Posiciones del usuario ese día (valoradas + excluidas). */
    totalPositions: integer('total_positions').notNull(),
    fxRates: jsonb('fx_rates').$type<Record<string, number>>().notNull(),
    /**
     * `true` si la fecha es anterior a `trackingSince` (`created_at` más antiguo de sus
     * posiciones): reconstrucción desde los lotes. La captura real (`captureUser`) siempre
     * sustituye la fila; una reconstrucción solo pisa estimadas u obsoletas. Ver `backfillUser`
     * y `@sextante/core/portfolio/staleness`. El frontend la usa para no presentarla como dato real.
     */
    estimated: boolean('estimated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);

/**
 * Configuraciones guardadas de una calculadora. `inputs` es `jsonb` porque el esquema de cada
 * calculadora vive en el frontend; el servicio acota tamaño, nº por usuario y `slug`
 * (`SavedScenariosService`).
 */
export const savedScenarios = pgTable(
  'saved_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // El del `registry.ts` del frontend.
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('saved_scenarios_user_id_idx').on(table.userId),
    index('saved_scenarios_user_slug_idx').on(table.userId, table.slug),
  ],
);

export type SavedScenario = typeof savedScenarios.$inferSelect;

/**
 * Precios de cierre (EOD) por símbolo y día: caché compartida por todos los usuarios que un job
 * diario refresca (`_local/datos-inversiones-api.md`). `symbol` ya está resuelto a la fuente
 * (ver `SymbolResolver`); `numeric(20,8)` cubre precios grandes y fracciones de cripto.
 */
export const instrumentPrices = pgTable(
  'instrument_prices',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Fecha del cierre (UTC); en findes/festivos, la del último cierre.
    date: date('date').notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    // Proveedor ("yahoo"…).
    source: varchar('source', { length: 20 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

/**
 * Tipos de cambio de referencia del BCE (los que publica el Banco de España): unidades de la
 * divisa por 1 euro. Separados de `instrument_prices` porque son otro dato: la referencia oficial
 * diaria que exige la declaración, no un cierre de mercado. Datos públicos y fijos: caché
 * permanente compartida (`fx-reference/`).
 */
export const fxReferenceRates = pgTable(
  'fx_reference_rates',
  {
    currency: varchar('currency', { length: 3 }).notNull(),
    // Día publicado; no hay filas en fines de semana ni festivos de TARGET2.
    date: date('date').notNull(),
    unitsPerEur: numeric('units_per_eur', { precision: 20, scale: 8 }).notNull(),
    // Fuente ("ecb").
    source: varchar('source', { length: 10 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.currency, table.date] })],
);

/**
 * Tramo ya descargado de cada divisa. Sin él, una serie vacía (divisa que el BCE no publica) o
 * un hueco no distinguirían "no existe" de "nunca se pidió", y se volvería a pedir cada vez.
 */
export const fxReferenceCoverage = pgTable('fx_reference_coverage', {
  currency: varchar('currency', { length: 3 }).primaryKey(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Splits: los cierres vienen ajustados y las cantidades de los lotes son crudas, así que el
 * histórico los necesita para expresar los lotes en acciones de hoy
 * (`@sextante/core/portfolio/history-reconstruction`). `ratio` = nuevas por antigua (10 en un 10:1); `date` =
 * primer día cotizando con el split (UTC).
 */
export const instrumentSplits = pgTable(
  'instrument_splits',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    date: date('date').notNull(),
    ratio: numeric('ratio', { precision: 20, scale: 8 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

/**
 * Dividendo por acción de cada pago, según la fuente de precios (Yahoo `events=div`), en la divisa
 * de cotización del símbolo y AJUSTADO por splits posteriores (como lo da Yahoo): se deshace con
 * `instrument_splits`. Contraste independiente del íntegro que declara el bróker
 * (`@sextante/core/fiscal/dividend-resolution`). Se refresca con los splits.
 */
export const instrumentDividends = pgTable(
  'instrument_dividends',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Fecha ex-dividendo (UTC), la que da Yahoo.
    exDate: date('ex_date').notNull(),
    amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.exDate] })],
);

/** Marca de "splits consultados": una `instrument_splits` vacía no distingue "sin splits" de "nunca consultado", ni vería un split posterior al priming. */
export const instrumentSplitChecks = pgTable('instrument_split_checks', {
  symbol: varchar('symbol', { length: 40 }).primaryKey(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Caché permanente de resolución ticker/ISIN → símbolo (cara y estable). `query` es lo tecleado
 * normalizado; `symbol` NULL cachea un "no encontrado" confirmado. Los fallos transitorios no
 * escriben fila para no bloquear un símbolo válido.
 */
export const instruments = pgTable('instruments', {
  query: varchar('query', { length: 40 }).primaryKey(),
  symbol: varchar('symbol', { length: 40 }),
  // "yahoo_search" | "openfigi" | "identity" | "not_found".
  source: varchar('source', { length: 20 }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Instrument = typeof instruments.$inferSelect;

/*
 * MCP / OAuth 2.1 (`_local/mcp-integracion.md`): el SDK monta el Authorization Server y
 * nosotros el provider. El `userId` viaja en el token y toda tool filtra por él; audience
 * binding al `…/api/mcp`; tokens y códigos solo hasheados (SHA-256), como `login_tokens`.
 */

/**
 * Clientes OAuth (Dynamic Client Registration, RFC 7591), guardados como `jsonb` porque es lo
 * que lee/escribe el `clientsStore` del SDK. Son anónimos: el consentimiento vive en
 * `oauth_grants`. Los públicos usan PKCE sin `client_secret`; si lo hay, el SDK lo compara en
 * claro y se conserva en el JSON (PKCE es la barrera real).
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').$type<OAuthClientInformationFull>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

/** Consentimientos (base jurídica RGPD; se revocan en "Aplicaciones conectadas"). Único por `(userId, clientId)`: los scopes se actualizan en sitio. */
export const oauthGrants = pgTable(
  'oauth_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('oauth_grants_user_client_idx').on(table.userId, table.clientId),
    index('oauth_grants_user_id_idx').on(table.userId),
  ],
);

/**
 * Códigos de autorización (PKCE): efímeros, de un solo uso y solo hasheados. Ligados a
 * `(clientId, redirectUri, codeChallenge, resource, userId)` para validar en el canje que nada
 * cambió entre `/authorize` y `/token`. El SDK valida el `code_verifier`; nosotros lo demás y
 * el single-use atómico (`UPDATE … WHERE consumedAt IS NULL … RETURNING`).
 */
export const oauthAuthCodes = pgTable('oauth_auth_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  codeChallenge: text('code_challenge').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  // URI canónico del recurso (RFC 8707) pedido en `/authorize`; se propaga al token.
  resource: text('resource'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Access y refresh tokens, solo hasheados. `verifyAccessToken` resuelve el Bearer a `userId` y
 * rechaza si la `audience` (RFC 8707) no es nuestro `…/api/mcp`. Refresh con rotación: al
 * canjearlo se marca `consumedAt` y se emite otro encadenado por `parentHash`, lo que permite
 * detectar el reuso de un refresh gastado y cortar la cadena.
 */
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    // 'access' | 'refresh'.
    type: varchar('type', { length: 10 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    audience: text('audience').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    // Hash del refresh padre (rotación); null si es el primero.
    parentHash: text('parent_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_tokens_user_id_idx').on(table.userId),
    index('oauth_tokens_user_client_idx').on(table.userId, table.clientId),
  ],
);

/** Auditoría de invocaciones MCP (usuario, cliente, tool, resultado): solo metadatos, no datos de la cartera. */
export const mcpAuditLog = pgTable(
  'mcp_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    tool: varchar('tool', { length: 64 }).notNull(),
    // 'ok' | 'error' | 'denied_scope' (tool de escritura sin permiso portfolio:write).
    outcome: varchar('outcome', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mcp_audit_log_user_id_idx').on(table.userId),
    // La tabla crece sin límite y el reaper de retención la poda por fecha: sin este índice
    // esa purga y las consultas por rango harían seq scan. Descendente: se consulta lo reciente.
    index('mcp_audit_log_created_at_idx').on(table.createdAt.desc()),
  ],
);

/**
 * Preferencias de email (sin fila, todo desactivado: opt-in). `lastFireMilestone` es el último
 * hito FIRE (25/50/75/100 %) avisado y solo sube; `null` = sin referencia, y la primera
 * evaluación tras activar las alertas la fija sin enviar nada. `fireGoalRef`
 * (`<id escenario>@<updatedAt>`) identifica la versión del objetivo de esa referencia: si
 * cambia, se retoma en silencio (subir el objetivo tras el 100 % no debe mudar las alertas, ni
 * bajarlo disparar un aviso). Sin token de baja guardado: el enlace lleva un HMAC del `userId`.
 */
export const userNotificationSettings = pgTable('user_notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fireAlertsEnabled: boolean('fire_alerts_enabled').notNull().default(false),
  /** Idioma de los emails (`es`/`en`): el de la interfaz cuando el usuario los activó. */
  locale: varchar('locale', { length: 5 }).notNull().default('es'),
  lastFireMilestone: smallint('last_fire_milestone'),
  fireGoalRef: text('fire_goal_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
