import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  numeric,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

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
