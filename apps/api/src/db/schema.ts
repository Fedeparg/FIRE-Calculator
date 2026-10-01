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

export type LoginToken = typeof loginTokens.$inferSelect;

/**
 * Posiciones tecleadas por el usuario (no hay conexión a bancos ni brókers).
 *
 * Aislamiento: `userId` con borrado en cascada (RGPD); el scoping se aplica en el servidor
 * con el `userId` del JWT, nunca del body. `quantity`/`avgPrice` son `numeric(18,6)` (Drizzle
 * los devuelve como `string`).
 *
 * Unicidad `(userId, ticker, broker)`: el bróker es opcional salvo al añadir un símbolo que ya
 * existe (regla del servicio). El índice funcional es la barrera de último recurso y replica
 * esa regla: `lower(coalesce(broker, ''))` lo hace case-insensitive y trata el bróker ausente
 * como cadena vacía (en Postgres dos NULL serían distintos y dejarían pasar duplicados).
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Lo que el usuario introduce: símbolo (p.ej. "IWDA") o ISIN ("IE00B4L5Y983").
    ticker: varchar('ticker', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // Precio medio de compra, en la divisa de la posición.
    avgPrice: numeric('avg_price', { precision: 18, scale: 6 }).notNull(),
    // Nombre libre ("Degiro", "IBKR"…).
    broker: varchar('broker', { length: 100 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Derivado (knock-out, warrant, turbo…): cuenta para el informe de plusvalías pero no se
    // valora ni entra en los totales. Lo fija la importación según el tipo de activo del bróker.
    isDerivative: boolean('is_derivative').notNull().default(false),
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
 * Lotes: cada compra o venta de una posición, con fecha, precio y comisiones. Dan el histórico
 * que `positions` (foto del estado actual) no puede: evolución, rentabilidad por periodo y
 * plusvalías FIFO.
 *
 * `positions.quantity/avgPrice` siguen siendo lo que leen valoración, MCP y UI y se recalculan
 * desde los lotes en cada mutación (`PositionLotsService.recompute`).
 *
 * `userId` está desnormalizado a propósito: filtra e indexa por usuario sin join y deja el
 * borrado RGPD en cascada por doble vía. Precisión `numeric(18,6)`, como `positions`.
 * `tradedAt` es un `date` sin hora, de ahí el orden canónico `(tradedAt, createdAt, id)` de la
 * agregación.
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
    // Precio unitario, en la divisa de la posición.
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
    // Comisiones, en la divisa de la posición. No entran en el precio medio (precio de mercado
    // puro) pero se guardan para la fiscalidad.
    fees: numeric('fees', { precision: 18, scale: 6 }).notNull().default('0'),
    tradedAt: date('traded_at').notNull(),
    note: varchar('note', { length: 200 }),
    // Id de la operación en el bróker, con prefijo ("trade-republic:<uuid>"); NULL si es manual.
    // Clave de deduplicación: reimportar un fichero no duplica operaciones.
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

export type PositionLotKind = 'buy' | 'sell';

export type PositionLot = typeof positionLots.$inferSelect;

/**
 * Foto diaria del valor de la cartera: la evolución y la rentabilidad temporal se leen de aquí
 * (los precios históricos de lo ya vendido no bastarían para reconstruir qué había cada día).
 *
 * `invested` y `marketValue` se guardan siempre en EUR. Para reexpresar la serie en otra divisa
 * se guardan las tasas del día en `fxRates` (USD por unidad, USD = 1, como
 * `PricesService.getFxRates`): EUR→X es `importe * fxRates.EUR / fxRates.X` con las de ese día.
 *
 * PK `(userId, date)`: la captura es un upsert idempotente. `numeric(20,8)` como
 * `instrument_prices.close`.
 */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Fecha del snapshot (UTC), no la del precio: en fin de semana se repite el último cierre.
    date: date('date').notNull(),
    /** Coste de las posiciones valoradas ese día, en EUR. */
    invested: numeric('invested', { precision: 20, scale: 8 }).notNull(),
    marketValue: numeric('market_value', { precision: 20, scale: 8 }).notNull(),
    /** Nº de posiciones que se pudieron valorar (había precio y FX convertible). */
    valuedPositions: integer('valued_positions').notNull(),
    /** Nº total de posiciones del usuario ese día (valuedPositions + excluidas). */
    totalPositions: integer('total_positions').notNull(),
    /** Tasas FX del día: USD por unidad de cada divisa (USD = 1). */
    fxRates: jsonb('fx_rates').$type<Record<string, number>>().notNull(),
    /**
     * `true` si la fecha es anterior a `trackingSince` (fecha UTC del `created_at` más antiguo
     * de sus posiciones): reconstrucción a partir de los lotes, valorada con la caché de
     * cierres. Desde `trackingSince` es `false` aunque la reescriba el backfill. La captura real
     * (`captureUser`) siempre sustituye la fila; una reconstrucción solo pisa filas estimadas u
     * obsoletas (operación registrada después con fecha anterior a la captura). Ver
     * `backfillUser` y `@sextante/core/snapshot-staleness`. El frontend la usa para no
     * presentar una aproximación con la certeza de un dato real.
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

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;

/**
 * Configuraciones guardadas de una calculadora. `inputs` es `jsonb` tal cual: el esquema de
 * cada calculadora vive en el frontend y tiparlo aquí acoplaría la API a 26 formularios. No es
 * almacenamiento libre: el servicio acota tamaño del JSON, nº de escenarios por usuario y forma
 * del `slug` (ver `SavedScenariosService`).
 */
export const savedScenarios = pgTable(
  'saved_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Slug de la calculadora (el del `registry.ts` del frontend): minúsculas, dígitos y guiones.
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
 * Precios de cierre (EOD) por símbolo y día. Caché propia compartida por todos los usuarios
 * (una fila por símbolo y día): el frontend lee siempre de aquí y un job diario refresca los
 * símbolos en uso. Ver `_local/datos-inversiones-api.md`.
 *
 * `symbol` ya está resuelto a la fuente de precios; la traducción ticker/ISIN → símbolo es del
 * `SymbolResolver`. `numeric(20,8)` cubre precios grandes y fracciones de cripto.
 */
export const instrumentPrices = pgTable(
  'instrument_prices',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Fecha del cierre (UTC); en findes/festivos, la del último cierre.
    date: date('date').notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    // Proveedor del dato ("yahoo"…), para trazabilidad y fallbacks.
    source: varchar('source', { length: 20 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

export type InstrumentPrice = typeof instrumentPrices.$inferSelect;

/**
 * Splits de un instrumento. Los cierres de `instrument_prices` vienen ajustados y las
 * cantidades de los lotes son crudas, así que la reconstrucción del histórico necesita los
 * splits para expresar los lotes en acciones de hoy (`@sextante/core/portfolio-history`).
 * `ratio` = acciones nuevas por cada antigua (10 en un 10:1, 0,5 en un 1:2 inverso); `date` =
 * primer día cotizando ya con el split (UTC).
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
 * Marca de "splits consultados" por símbolo: `instrument_splits` vacía no distingue "sin
 * splits" de "nunca consultado". El arranque consulta los símbolos sin marca y refresca los de
 * marca antigua (un split posterior al priming no se vería de otro modo).
 */
export const instrumentSplitChecks = pgTable('instrument_split_checks', {
  symbol: varchar('symbol', { length: 40 }).primaryKey(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Caché permanente de resolución ticker/ISIN → símbolo de la fuente de precios (la traducción
 * es cara y no cambia).
 *
 * `query` es lo tecleado, normalizado (trim + mayúsculas). `symbol` es NULL si se confirmó que
 * no existe: cachear el "no encontrado" evita repetir la búsqueda. Los fallos transitorios
 * (red, rate-limit) no escriben fila, para no bloquear un símbolo válido por un hipo.
 */
export const instruments = pgTable('instruments', {
  query: varchar('query', { length: 40 }).primaryKey(),
  symbol: varchar('symbol', { length: 40 }),
  // Cómo se resolvió: "yahoo_search" | "openfigi" | "identity" | "not_found".
  source: varchar('source', { length: 20 }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Instrument = typeof instruments.$inferSelect;

/*
 * MCP / OAuth 2.1. El Authorization Server lo monta el SDK (`mcpAuthRouter`); nosotros
 * implementamos el provider y emitimos los tokens (`_local/mcp-integracion.md`).
 * El `userId` viaja dentro del token y toda tool filtra por él; audience binding al `…/api/mcp`;
 * tokens y códigos solo se guardan hasheados (SHA-256), como `login_tokens`.
 */

/**
 * Clientes OAuth, normalmente vía Dynamic Client Registration (RFC 7591). Se guarda la info
 * completa (`OAuthClientInformationFull`) como `jsonb`, justo lo que lee/escribe el
 * `clientsStore` del SDK. El cliente es anónimo (sin `userId`): el consentimiento vive en
 * `oauth_grants`.
 *
 * Los clientes públicos (Claude/ChatGPT) usan PKCE sin `client_secret`; si lo hay, el SDK lo
 * compara en claro, así que se conserva en el JSON (PKCE es la barrera real).
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').$type<OAuthClientInformationFull>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export type OAuthClientRow = typeof oauthClients.$inferSelect;

/**
 * Consentimientos: scopes que un usuario concede a un cliente (base jurídica RGPD; se
 * lista/revoca en "Aplicaciones conectadas"). Único por `(userId, clientId)`: los scopes se
 * actualizan en sitio.
 */
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

export type OAuthGrant = typeof oauthGrants.$inferSelect;

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

export type OAuthAuthCode = typeof oauthAuthCodes.$inferSelect;

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

export type OAuthTokenRow = typeof oauthTokens.$inferSelect;

/**
 * Auditoría de invocaciones MCP: quién (usuario+cliente) llamó a qué tool y con qué resultado.
 * Solo metadatos de la llamada, no datos de la cartera.
 */
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

export type McpAuditLogRow = typeof mcpAuditLog.$inferSelect;

/**
 * Preferencias de email por usuario. Sin fila, todo está desactivado (las alertas son opt-in).
 *
 * `lastFireMilestone` es el último hito FIRE (25/50/75/100 %) avisado; solo sube, así que una
 * caída del mercado no repite un hito. `null` = sin referencia: la primera evaluación tras
 * activar las alertas fija el hito actual sin enviar nada.
 *
 * `fireGoalRef` (`<id del escenario>@<updatedAt>`) identifica la versión del objetivo sobre la
 * que se tomó esa referencia; si el usuario lo cambia o edita, se retoma en silencio (subir el
 * objetivo tras el 100 % no debe dejar las alertas mudas, ni bajarlo disparar un aviso).
 *
 * No se guarda token de baja: el enlace lleva un HMAC del `userId`
 * (`notifications/unsubscribe-token.ts`).
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

export type UserNotificationSettings = typeof userNotificationSettings.$inferSelect;
