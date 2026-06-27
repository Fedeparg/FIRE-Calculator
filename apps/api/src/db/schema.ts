import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  numeric,
  index,
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
    // Nombre libre del bróker/banco ("Degiro", "IBKR", "MyInvestor"…).
    broker: varchar('broker', { length: 100 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('positions_user_id_idx').on(table.userId)],
);

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
