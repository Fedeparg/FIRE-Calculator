import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  numeric,
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
 * mismo símbolo comprado en distintos sitios. El índice único es la barrera de último
 * recurso para duplicados exactos con bróker no nulo (la detección case-insensitive, la
 * regla "bróker requerido si el símbolo existe" y el flujo de "combinar" viven en el servicio).
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
      table.broker,
    ),
  ],
);

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;

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
  // Cómo se resolvió: "openfigi" | "identity" | "not_found" (trazabilidad).
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
  (table) => [index('mcp_audit_log_user_id_idx').on(table.userId)],
);

export type McpAuditLogRow = typeof mcpAuditLog.$inferSelect;
export type NewMcpAuditLogRow = typeof mcpAuditLog.$inferInsert;
