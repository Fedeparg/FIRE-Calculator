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
 * Esquema de base de datos (única fuente de verdad). Drizzle genera las
 * migraciones a partir de aquí (`pnpm db:generate`).
 *
 * Principio de minimización de datos (RGPD): solo guardamos lo imprescindible.
 * Para el esqueleto, únicamente la tabla `users` (sin contraseñas: el login será
 * por magic link). Las tablas de tokens de acceso y de posiciones se añadirán en
 * sus respectivas rebanadas.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Tokens de inicio de sesión sin contraseña (magic link).
 *
 * Seguridad: NUNCA guardamos el token en claro, solo su hash (SHA-256). El enlace
 * que recibe el usuario lleva el token en claro; al verificar, hasheamos lo recibido
 * y buscamos por hash. Son de un solo uso (`consumedAt`) y caducan (`expiresAt`).
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
export type NewLoginToken = typeof loginTokens.$inferInsert;

/**
 * Posiciones de la cartera introducidas manualmente por el usuario. Sextante es un
 * agregador: el usuario teclea sus posiciones; no nos conectamos a bancos ni brokers.
 *
 * Seguridad / aislamiento: cada posición pertenece a un `userId` (FK a `users`, con
 * borrado en cascada para respetar el "borrar mi cuenta" del RGPD). El scoping por
 * usuario se aplica SIEMPRE en el servidor; el `userId` se lee del JWT, nunca del body.
 *
 * Precisión: `quantity` y `avgPrice` usan `numeric(18,6)` (no float) para no perder
 * céntimos ni fracciones de participación. Drizzle los devuelve como `string`.
 *
 * Unicidad: una posición se identifica por `(userId, ticker, broker)`. El bróker es
 * OPCIONAL en general, pero pasa a ser obligatorio al añadir un símbolo que YA tiene otra
 * entrada (regla de negocio en el servicio, no en el esquema): así se puede distinguir el
 * mismo símbolo comprado en distintos sitios. El índice único FUNCIONAL es la barrera de
 * último recurso para duplicados, y refleja EXACTAMENTE la regla del servicio:
 * `lower(coalesce(broker, ''))` hace que sea case-insensitive (Degiro = degiro) y que el
 * bróker ausente (NULL) cuente como cadena vacía → un usuario no puede tener dos entradas
 * del mismo símbolo sin bróker (en Postgres dos NULL serían distintos, lo que dejaría
 * pasar duplicados). La detección case-insensitive y el flujo de "combinar" viven en el
 * servicio; este índice los respalda a nivel de BD.
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
    // Nombre legible opcional (p.ej. "iShares Core MSCI World").
    name: varchar('name', { length: 100 }),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // Precio medio de compra, en la divisa de la posición.
    avgPrice: numeric('avg_price', { precision: 18, scale: 6 }).notNull(),
    // Nombre libre del bróker/banco ("Degiro", "IBKR", "MyInvestor"…). Opcional; el
    // servicio lo exige solo cuando ya existe otra entrada del mismo símbolo.
    broker: varchar('broker', { length: 100 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Derivado (knock-out, warrant, turbo…): se registra con sus operaciones (cuenta para el
    // informe de plusvalías) pero NO se valora ni entra en los totales de la cartera: Sextante
    // no sigue su precio. Lo fija la importación según el tipo de activo del bróker.
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
export type NewPosition = typeof positions.$inferInsert;

/**
 * Lotes (transacciones individuales) de una posición: cada compra o venta concreta, con su
 * fecha, precio y comisiones. Es el histórico que `positions` —una FOTO del estado actual—
 * no puede dar: sin lotes no hay evolución temporal, ni rentabilidad por periodo, ni
 * fiscalidad de plusvalías (FIFO del IRPF español).
 *
 * COMPATIBILIDAD: `positions.quantity` y `positions.avgPrice` SIGUEN siendo la fuente que
 * leen la valoración, las tools MCP y la UI. No se sustituyen: se RECALCULAN a partir de los
 * lotes en cada mutación (ver `PositionLotsService.recompute`), de modo que nada de lo que
 * existe hoy se rompe aunque la interfaz de lotes esté incompleta.
 *
 * `userId` está DESNORMALIZADO a propósito (se puede derivar por `positionId`): permite
 * filtrar e indexar por usuario sin join y deja el borrado RGPD en cascada por partida doble
 * (borrar el usuario borra sus lotes aunque la posición se hubiese desligado).
 *
 * Precisión: `numeric(18,6)`, la MISMA de `positions`, nunca float. Drizzle los devuelve como
 * `string` y la agregación se hace con aritmética decimal exacta (ver `decimal.ts`).
 *
 * `tradedAt` es un `date` (sin hora): dos lotes pueden caer el mismo día, así que el orden
 * canónico de la agregación es `(tradedAt, createdAt, id)` —definido en el servicio— para que
 * el coste medio móvil sea determinista.
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
    // 'buy' | 'sell'. Mismo patrón que `oauth_tokens.type` y `mcp_audit_log.outcome`.
    kind: varchar('kind', { length: 4 }).$type<PositionLotKind>().notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // Precio unitario de la operación, en la divisa de la posición.
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
    // Comisiones/gastos de la operación, en la divisa de la posición. No entran en el precio
    // medio (que es precio de mercado puro), pero se guardan para la futura fiscalidad.
    fees: numeric('fees', { precision: 18, scale: 6 }).notNull().default('0'),
    tradedAt: date('traded_at').notNull(),
    note: varchar('note', { length: 200 }),
    // Id de la operación en el bróker de origen, con prefijo de bróker ("trade-republic:<uuid>").
    // NULL en lo registrado a mano. Es la clave de deduplicación de las importaciones: reimportar
    // el mismo fichero no duplica operaciones (ver el índice único parcial de abajo).
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('position_lots_position_id_idx').on(table.positionId),
    // Único POR USUARIO (el lote lleva `user_id` desnormalizado): dos usuarios pueden importar
    // el mismo id de operación sin colisionar, y un mismo id no puede acabar en dos posiciones
    // del mismo usuario. Parcial: los lotes manuales (NULL) no entran.
    uniqueIndex('position_lots_user_external_id_idx')
      .on(table.userId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index('position_lots_user_id_idx').on(table.userId),
    index('position_lots_traded_at_idx').on(table.tradedAt),
  ],
);

/** Tipo de operación de un lote. */
export type PositionLotKind = 'buy' | 'sell';

export type PositionLot = typeof positionLots.$inferSelect;
export type NewPositionLot = typeof positionLots.$inferInsert;

/**
 * Foto diaria del valor de la cartera de un usuario. Es lo que convierte el portfolio en una
 * PELÍCULA: la gráfica de evolución y la rentabilidad temporal se leen de aquí, no se
 * recalculan hacia atrás (los precios históricos de un instrumento que el usuario ya vendió
 * no bastarían para reconstruir qué tenía cada día).
 *
 * DIVISA BASE CANÓNICA: `invested` y `marketValue` se guardan SIEMPRE en **EUR**. Sextante
 * está enfocado al inversor español, así que el euro es la unidad natural del histórico y
 * evita tener que decidir la divisa en el momento de capturar. Para poder REEXPRESAR la serie
 * en cualquier divisa soportada sin recalcularla, se guardan además las tasas FX del día en
 * `fxRates` (USD por unidad de divisa, USD = 1: la misma forma que `PricesService.getFxRates`),
 * de modo que EUR→X es `importe * fxRates.EUR / fxRates.X` con las tasas de AQUEL día.
 *
 * Clave primaria `(userId, date)`: un snapshot por usuario y día. La captura es idempotente
 * (upsert), así que correr el cron dos veces el mismo día actualiza la fila, no la duplica.
 *
 * Precisión: `numeric(20,8)` (como `instrument_prices.close`), no float.
 */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Fecha del snapshot (UTC), no la del precio: en fin de semana se repite el último cierre.
    date: date('date').notNull(),
    /** Coste de las posiciones VALORADAS ese día, en EUR. */
    invested: numeric('invested', { precision: 20, scale: 8 }).notNull(),
    /** Valor de mercado de las posiciones valoradas ese día, en EUR. */
    marketValue: numeric('market_value', { precision: 20, scale: 8 }).notNull(),
    /** Nº de posiciones que se pudieron valorar (había precio y FX convertible). */
    valuedPositions: integer('valued_positions').notNull(),
    /** Nº total de posiciones del usuario ese día (valuedPositions + excluidas). */
    totalPositions: integer('total_positions').notNull(),
    /** Tasas FX del día: USD por unidad de cada divisa (USD = 1). */
    fxRates: jsonb('fx_rates').$type<Record<string, number>>().notNull(),
    /**
     * `true` si esta fila es una RECONSTRUCCIÓN a partir de los lotes (la cantidad y el coste
     * que se tenían ese día según las operaciones, valorados con los cierres de la caché), no una
     * captura real del cron de esa fecha. Una captura real (`PortfolioSnapshotsService.captureUser`)
     * SIEMPRE la sustituye, pase lo que pase; una reconstrucción posterior solo vuelve a escribir
     * las filas estimadas (borra y regenera) y nunca pisa una real (ver `backfillUser`). El
     * frontend la usa para no presentar una aproximación con la misma certeza que un dato real.
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
export type NewPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

/**
 * Configuraciones guardadas de una calculadora ("mi plan FIRE a los 45"). `slug` identifica
 * la calculadora (el mismo del `registry.ts` del frontend) e `inputs` guarda sus campos tal
 * cual, como `jsonb`: el esquema de entrada de cada calculadora vive en el frontend y cambia
 * con ella, así que tipar aquí cada una acoplaría la API a 26 formularios.
 *
 * NO es almacenamiento libre: el servicio acota el tamaño del JSON, el número de escenarios
 * por usuario y la forma del `slug` (ver `SavedScenariosService`). FK con borrado en cascada.
 */
export const savedScenarios = pgTable(
  'saved_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Slug de la calculadora (p. ej. "fire-basico"). Minúsculas, dígitos y guiones.
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
export type NewSavedScenario = typeof savedScenarios.$inferInsert;

/**
 * Precios de cierre (EOD) por símbolo y día. Caché propia: el frontend SIEMPRE lee de
 * aquí, nunca de la API externa. Un job diario refresca los símbolos en uso (compartido
 * entre TODOS los usuarios: 1 fila por símbolo y día, no por usuario), así que el tráfico
 * a la API de cotización es mínimo. Ver `_local/datos-inversiones-api.md`.
 *
 * `symbol` es el símbolo ya resuelto a la fuente de precios (hoy Yahoo: "AAPL", "EUNL.DE",
 * "BTC-USD"). La traducción ticker/ISIN → símbolo es responsabilidad del `SymbolResolver`
 * (hoy identidad; OpenFIGI más adelante), no de esta tabla.
 *
 * Precisión: `numeric(20,8)` cubre tanto precios grandes como fracciones de cripto.
 */
export const instrumentPrices = pgTable(
  'instrument_prices',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Fecha del cierre (en UTC). En findes/festivos de bolsa, es la del último cierre.
    date: date('date').notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    // Proveedor que dio el dato ("yahoo"…), para trazabilidad y futuros fallbacks.
    source: varchar('source', { length: 20 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

export type InstrumentPrice = typeof instrumentPrices.$inferSelect;
export type NewInstrumentPrice = typeof instrumentPrices.$inferInsert;

/**
 * Splits de un instrumento (fuente: `events=split` de la misma llamada de histórico). Los cierres
 * de `instrument_prices` vienen ajustados por splits y las cantidades de los lotes son crudas, así
 * que la reconstrucción del histórico de la cartera necesita saber cuándo hubo splits para
 * expresar los lotes en acciones de hoy (ver `@sextante/core/portfolio-history`).
 * `ratio` = acciones nuevas por cada antigua (10 en un 10:1, 0,5 en un 1:2 inverso). `date` es el
 * primer día cotizando ya con el split (UTC). PK `(symbol, date)`.
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
 * Caché de resolución ticker/ISIN → símbolo de la fuente de precios. La traducción real
 * (OpenFIGI: ISIN → ticker+mercado, validado contra Yahoo) es cara y NO cambia con el
 * tiempo, así que se cachea aquí permanentemente.
 *
 * `query` es lo que el usuario tecleó, NORMALIZADO (trim + mayúsculas). `symbol` es el
 * símbolo resuelto (p. ej. "EUNL.DE") o NULL si se confirmó que no existe (p. ej. OpenFIGI
 * devolvió 0 coincidencias): cachear el "no encontrado" evita repetir la búsqueda. Los
 * fallos transitorios (red, rate-limit de Yahoo) NO escriben fila, para no "bloquear" un
 * símbolo válido por un hipo puntual. Ver `_local/datos-inversiones-api.md`.
 */
export const instruments = pgTable('instruments', {
  query: varchar('query', { length: 40 }).primaryKey(),
  symbol: varchar('symbol', { length: 40 }),
  // Cómo se resolvió: "yahoo_search" | "openfigi" | "identity" | "not_found" (trazabilidad).
  source: varchar('source', { length: 20 }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Instrument = typeof instruments.$inferSelect;
export type NewInstrument = typeof instruments.$inferInsert;

/* ------------------------------------------------------------------------- */
/* MCP / OAuth 2.1                                                            */
/*                                                                           */
/* Sextante expone un servidor MCP remoto (Streamable HTTP) para que LLMs    */
/* externos (Claude, ChatGPT…) lean/escriban la cartera del usuario. La      */
/* autorización es OAuth 2.1 (estándar MCP): el Authorization Server lo monta */
/* el propio SDK oficial (`mcpAuthRouter`) y NOSOTROS implementamos el        */
/* provider y emitimos los tokens. Ver `_local/mcp-integracion.md`.          */
/*                                                                           */
/* Anti data-leakage: el `userId` viaja DENTRO del token; toda tool filtra   */
/* por él (igual que `positions`). Audience binding (el token solo vale para  */
/* nuestro `…/api/mcp`). Tokens/códigos SOLO se guardan hasheados (SHA-256),  */
/* nunca en claro (mismo patrón que `login_tokens`).                         */
/* ------------------------------------------------------------------------- */

/**
 * Clientes OAuth registrados, normalmente vía Dynamic Client Registration (RFC 7591):
 * cuando el usuario conecta Claude/ChatGPT, su cliente se registra aquí automáticamente.
 *
 * Guardamos la información completa del cliente (la forma que define el SDK,
 * `OAuthClientInformationFull`) como `jsonb`, porque es justo lo que el `clientsStore`
 * del SDK lee/escribe. El cliente DCR es ANÓNIMO (no hay `userId`): el vínculo
 * usuario↔cliente —el consentimiento— vive en `oauth_grants`, no aquí.
 *
 * Nota seguridad: los clientes MCP públicos (Claude/ChatGPT) usan PKCE sin
 * `client_secret`; cuando hay secreto, el SDK lo compara en claro, así que se conserva
 * dentro del JSON tal cual lo exige la librería (PKCE es la barrera real).
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').$type<OAuthClientInformationFull>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export type OAuthClientRow = typeof oauthClients.$inferSelect;
export type NewOAuthClientRow = typeof oauthClients.$inferInsert;

/**
 * Consentimientos: qué scopes ha concedido un usuario a un cliente. Es la base jurídica
 * (RGPD) del acceso y lo que se lista/revoca en "Aplicaciones conectadas". Único por
 * `(userId, clientId)`: un cliente tiene un consentimiento por usuario (los scopes se
 * actualizan en sitio). FK con borrado en cascada para "borrar mi cuenta".
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
export type NewOAuthGrant = typeof oauthGrants.$inferInsert;

/**
 * Códigos de autorización (PKCE), efímeros y de UN SOLO USO. Se guardan SOLO hasheados.
 * Ligados a `(clientId, redirectUri, codeChallenge, resource, userId)` para que el canje
 * valide que nada cambió entre `/authorize` y `/token`. El SDK valida el `code_verifier`
 * contra `codeChallenge` (PKCE) por nosotros; nosotros validamos lo demás y el single-use
 * atómico (`UPDATE … WHERE consumedAt IS NULL … RETURNING`, como en `login_tokens`).
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
  // URI canónico del recurso (RFC 8707) solicitado en `/authorize`; se propaga al token.
  resource: text('resource'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type OAuthAuthCode = typeof oauthAuthCodes.$inferSelect;
export type NewOAuthAuthCode = typeof oauthAuthCodes.$inferInsert;

/**
 * Access y refresh tokens, SOLO hasheados (SHA-256), nunca en claro. Cada token lleva su
 * dueño (`userId`), `clientId`, `scopes`, `audience` (binding RFC 8707) y caducidad.
 *
 * Aislamiento: `verifyAccessToken` resuelve el Bearer → `userId` y RECHAZA si la
 * `audience` no es nuestro `…/api/mcp`. Refresh con rotación: al canjear un refresh se
 * marca `consumedAt` y se emite uno nuevo encadenado por `parentHash` (permite detectar
 * reuso de un refresh ya gastado y cortar la cadena).
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
    // Hash del refresh padre del que nació este token (rotación); null si es el primero.
    parentHash: text('parent_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_tokens_user_id_idx').on(table.userId),
    index('oauth_tokens_user_client_idx').on(table.userId, table.clientId),
  ],
);

export type OAuthTokenRow = typeof oauthTokens.$inferSelect;
export type NewOAuthTokenRow = typeof oauthTokens.$inferInsert;

/**
 * Registro de auditoría de invocaciones MCP: quién (usuario+cliente) llamó a qué tool y
 * con qué resultado. Para trazabilidad e investigación de incidentes (no guarda los datos
 * de la cartera, solo metadatos de la llamada). FK con borrado en cascada.
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
    // Índice por fecha: la tabla crece sin límite (una fila por invocación de tool) y el
    // reaper de retención la poda con `DELETE ... WHERE created_at < corte`. Sin este
    // índice esa purga —y cualquier consulta por rango de fechas— haría seq scan sobre
    // toda la tabla. Descendente porque las consultas interesantes son "lo más reciente".
    index('mcp_audit_log_created_at_idx').on(table.createdAt.desc()),
  ],
);

export type McpAuditLogRow = typeof mcpAuditLog.$inferSelect;
export type NewMcpAuditLogRow = typeof mcpAuditLog.$inferInsert;

/**
 * Preferencias de notificación por email de cada usuario. Una fila por usuario, creada la
 * primera vez que las toca: sin fila, todo está DESACTIVADO (las alertas son opt-in).
 *
 * `lastFireMilestone` es el último hito del objetivo FIRE (25/50/75/100 %) ya avisado. Solo
 * sube: una caída del mercado no vuelve a disparar un hito ya enviado. `null` significa "aún
 * sin referencia": la primera evaluación tras activar las alertas fija el hito actual SIN
 * enviar nada, para no estrenar la suscripción con un aviso de algo que ya se había pasado.
 *
 * `fireGoalRef` identifica la versión del objetivo sobre la que se tomó esa referencia
 * (`<id del escenario>@<updatedAt>`). Si el usuario cambia de objetivo o lo edita, la
 * referencia se vuelve a tomar en silencio: un hito del objetivo anterior no dice nada del
 * nuevo (subir el objetivo tras llegar al 100 % no debe dejar las alertas mudas, y bajarlo
 * no debe disparar un aviso esa misma noche).
 *
 * No hay token de baja guardado: el enlace lleva un HMAC del `userId` (ver
 * `notifications/unsubscribe-token.ts`), que no caduca ni hay que rotar.
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
