import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

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
