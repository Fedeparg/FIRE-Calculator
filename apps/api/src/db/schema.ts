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
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { IncomeKind, IncomeSource, ValueSource } from '@sextante/core/fiscal/income';
import type { SavingsGroup } from '@sextante/core/fiscal/savings-base';
import type { AssetClass } from '@sextante/core/portfolio/types';

/**
 * Allowed values of the text columns holding a closed union. They repeat those of
 * `@sextante/core` as literals because drizzle-kit loads this file without resolving the shared
 * package; `schema-checks.test.ts` checks that they match the core constants.
 */
export const DB_ENUM_VALUES = {
  lotKind: ['buy', 'sell'] satisfies PositionLotKind[],
  assetClass: ['stock', 'fund', 'derivative', 'other'] satisfies AssetClass[],
  incomeKind: ['dividend', 'interest', 'benefit'] satisfies IncomeKind[],
  incomeSource: ['manual', 'trade_republic'] satisfies IncomeSource[],
  valueSource: ['broker', 'derived', 'market', 'estimate', 'manual'] satisfies ValueSource[],
  savingsGroup: ['gains', 'capitalIncome'] satisfies SavingsGroup[],
} as const;

/** `column IN ('a', 'b')` for a `CHECK`: DDL does not accept parameters and the values are our own constants. */
function oneOf(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;
}

/**
 * Database schema (single source of truth); Drizzle generates the migrations
 * (`pnpm db:generate`). Data minimisation (GDPR): no passwords, sign-in is by magic link.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Session version: it goes into the JWT (`ver`) and bumping it invalidates every JWT already
  // issued (logout, "close all sessions"). See `SessionService`.
  sessionVersion: integer('session_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

/**
 * Magic link tokens. Only the hash (SHA-256) is stored: the link carries the plain token and
 * verification looks it up by hash. Single-use (`consumedAt`) and expiring (`expiresAt`).
 * The `(email, created_at)` index serves the per-email link limit (`AuthService.requestLink`).
 */
export const loginTokens = pgTable(
  'login_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('login_tokens_email_created_at_idx').on(table.email, table.createdAt),
    // The hourly pruning in `jobs/data-retention.ts` deletes by age: without it, a seq scan every hour.
    index('login_tokens_created_at_idx').on(table.createdAt),
  ],
);

/**
 * Positions typed in by the user (no bank connection). `userId` cascades (GDPR);
 * `quantity`/`avgPrice` are `numeric(18,6)` (string in Drizzle).
 *
 * Uniqueness of `(userId, ticker, broker)`: the functional index is the last-resort guard behind
 * the service rule; `lower(coalesce(broker, ''))` makes it case-insensitive and treats a missing
 * broker as '' (two NULLs would be distinct in Postgres and let duplicates through).
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Symbol (e.g. "IWDA") or ISIN, as typed by the user.
    ticker: varchar('ticker', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // In the position's currency.
    avgPrice: numeric('avg_price', { precision: 18, scale: 6 }).notNull(),
    broker: varchar('broker', { length: 100 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Derivative (knock-out, warrant…): counts for capital gains but is not valued nor included in totals.
    isDerivative: boolean('is_derivative').notNull().default(false),
    // Asset class (`AssetClass`): decides the tax return block. NULL = unclassified.
    assetClass: varchar('asset_class', { length: 12 }).$type<AssetClass>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // No dedicated `user_id` index: the unique `(user_id, ticker, …)` one already serves per-user lookups.
  (table) => [
    uniqueIndex('positions_user_ticker_broker_idx').on(
      table.userId,
      table.ticker,
      sql`lower(coalesce(${table.broker}, ''))`,
    ),
    check(
      'positions_asset_class_check',
      sql`${table.assetClass} is null or ${oneOf(table.assetClass, DB_ENUM_VALUES.assetClass)}`,
    ),
  ],
);

export type Position = typeof positions.$inferSelect;

/**
 * Lots: each buy or sell of a position. They provide the history that `positions` (a snapshot)
 * cannot: evolution, per-period returns and FIFO capital gains. `positions.quantity/avgPrice` are
 * recomputed from them on every mutation (`PositionLotsService.recompute`).
 *
 * `userId` is denormalised on purpose: it filters and indexes without a join and makes the GDPR
 * cascade delete happen through two paths. `tradedAt` is a `date` without time, hence the
 * aggregation's canonical order `(tradedAt, createdAt, id)`.
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
    // Price and fees in the position's currency; fees stay out of the average price (kept for tax purposes).
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
    fees: numeric('fees', { precision: 18, scale: 6 }).notNull().default('0'),
    tradedAt: date('traded_at').notNull(),
    note: varchar('note', { length: 200 }),
    // Broker id with a prefix ("trade-republic:<uuid>"), NULL if manual: the deduplication key on re-import.
    externalId: varchar('external_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The canonical order of a position's lots (`compareLots`): reads come back already sorted by the index.
    index('position_lots_position_order_idx').on(table.positionId, table.tradedAt, table.createdAt, table.id),
    // Unique per user: two users can import the same id without colliding, and an id cannot end
    // up in two positions of the same user. Partial: manual lots (NULL) are left out.
    uniqueIndex('position_lots_user_external_id_idx')
      .on(table.userId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index('position_lots_user_id_idx').on(table.userId),
    // A `kind` other than 'buy' would be treated as a sell: the database keeps it out.
    check('position_lots_kind_check', oneOf(table.kind, DB_ENUM_VALUES.lotKind)),
    check('position_lots_quantity_check', sql`${table.quantity} > 0`),
    check('position_lots_price_check', sql`${table.price} >= 0`),
    check('position_lots_fees_check', sql`${table.fees} >= 0`),
  ],
);

/**
 * Payments taxed as "rendimientos del capital mobiliario" (investment income): dividends, interest
 * and broker rewards (`@sextante/core/fiscal/income`). They are kept apart from lots because they do
 * not change any position's quantity; `positionId` is optional (account interest has no position)
 * and is set to NULL if the position is deleted: the payment still belongs to the tax year.
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
    // Source country (ISO 3166-1 alpha-2), for double taxation.
    country: varchar('country', { length: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    // Gross amount; negative only when reversing an imported payment.
    gross: numeric('gross', { precision: 18, scale: 6 }).notNull(),
    // NULL = unknown (not the same as 0).
    withholdingOrigin: numeric('withholding_origin', { precision: 18, scale: 6 }),
    withholdingSpain: numeric('withholding_spain', { precision: 18, scale: 6 }).notNull().default('0'),
    // The payer already reported it to the AEAT (Spanish tax agency): it may be in the draft return.
    reportedToAeat: boolean('reported_to_aeat').notNull().default(false),
    source: varchar('source', { length: 20 }).$type<IncomeSource>().notNull(),
    // Where each figure comes from (`ValueSource`): broker, derived, market data, estimate or manual.
    grossSource: varchar('gross_source', { length: 10 }).$type<ValueSource>().notNull().default('manual'),
    // NULL while the withholding at source is unknown.
    withholdingOriginSource: varchar('withholding_origin_source', { length: 10 }).$type<ValueSource>(),
    // Broker data that allows the payment to be resolved again with market data later.
    quantity: numeric('quantity', { precision: 18, scale: 6 }),
    originalAmount: numeric('original_amount', { precision: 18, scale: 6 }),
    originalCurrency: varchar('original_currency', { length: 3 }),
    // As in `position_lots`: "trade-republic:<uuid>", NULL if manual.
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
    check('income_events_kind_check', oneOf(table.kind, DB_ENUM_VALUES.incomeKind)),
    check('income_events_source_check', oneOf(table.source, DB_ENUM_VALUES.incomeSource)),
    check('income_events_gross_source_check', oneOf(table.grossSource, DB_ENUM_VALUES.valueSource)),
    check(
      'income_events_withholding_origin_source_check',
      sql`${table.withholdingOriginSource} is null or ${oneOf(table.withholdingOriginSource, DB_ENUM_VALUES.valueSource)}`,
    ),
  ],
);

export type IncomeEventRow = typeof incomeEvents.$inferSelect;

/**
 * Negative balances of the "base del ahorro" (savings tax base) still to be offset that come from
 * tax years Sextante does not compute (the user copies them from their latest return, annex C.3).
 * Those of the years it does compute carry forward on their own
 * (`@sextante/core/fiscal/savings-return`). `amount` is what is pending at the start of the first
 * tax year Sextante computes.
 */
export const savingsPendingBalances = pgTable(
  'savings_pending_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originYear: integer('origin_year').notNull(),
    // "gains" (capital gains and losses) or "capitalIncome" (investment income).
    kind: varchar('kind', { length: 16 }).$type<SavingsGroup>().notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('savings_pending_balances_user_year_kind_idx').on(table.userId, table.originYear, table.kind),
    check('savings_pending_balances_kind_check', oneOf(table.kind, DB_ENUM_VALUES.savingsGroup)),
  ],
);

export type PositionLotKind = 'buy' | 'sell';

export type PositionLot = typeof positionLots.$inferSelect;

/**
 * Daily snapshot of the portfolio value (the evolution is read from here: the prices of what has
 * already been sold would not be enough to rebuild each day). `invested` and `marketValue` are
 * always in EUR; `fxRates` stores the day's rates (USD per unit, USD = 1) to re-express the series:
 * EUR→X is `amount * fxRates.EUR / fxRates.X`. PK `(userId, date)`: idempotent upsert.
 */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Snapshot date (UTC), not the price date: on weekends the last close repeats.
    date: date('date').notNull(),
    /** Cost of the positions valued that day, in EUR (`numeric(20,8)`, like `instrument_prices.close`). */
    invested: numeric('invested', { precision: 20, scale: 8 }).notNull(),
    marketValue: numeric('market_value', { precision: 20, scale: 8 }).notNull(),
    /** Positions that could be valued (there was a price and a convertible FX rate). */
    valuedPositions: integer('valued_positions').notNull(),
    /** The user's positions that day (valued + excluded). */
    totalPositions: integer('total_positions').notNull(),
    fxRates: jsonb('fx_rates').$type<Record<string, number>>().notNull(),
    /**
     * `true` if the date is before `trackingSince` (the oldest `created_at` of their positions):
     * a reconstruction from the lots. The real capture (`captureUser`) always replaces the row; a
     * reconstruction only overwrites estimated or stale ones. See `backfillUser` and
     * `@sextante/core/portfolio/staleness`. The frontend uses it so as not to present it as real data.
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
 * Saved calculator configurations. `inputs` is `jsonb` because each calculator's schema lives in
 * the frontend; the service bounds size, count per user and `slug`
 * (`SavedScenariosService`).
 */
export const savedScenarios = pgTable(
  'saved_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The one from the frontend's `registry.ts`.
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // `(user_id, slug)` also serves lookups by user alone.
  (table) => [index('saved_scenarios_user_slug_idx').on(table.userId, table.slug)],
);

export type SavedScenario = typeof savedScenarios.$inferSelect;

/**
 * Closing (EOD) prices per symbol and day: a cache shared by all users that a daily job refreshes
 * (`_local/datos-inversiones-api.md`). `symbol` is already resolved for the source
 * (see `SymbolResolver`); `numeric(20,8)` covers large prices and crypto fractions.
 */
export const instrumentPrices = pgTable(
  'instrument_prices',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Close date (UTC); on weekends/holidays, that of the last close.
    date: date('date').notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    // Provider ("yahoo"…).
    source: varchar('source', { length: 20 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.date] })],
);

/**
 * ECB reference exchange rates (the ones the Banco de España publishes): units of the currency
 * per 1 euro. Kept apart from `instrument_prices` because they are different data: the daily
 * official reference the tax return requires, not a market close. Public, fixed data: a
 * permanent shared cache (`fx-reference/`).
 */
export const fxReferenceRates = pgTable(
  'fx_reference_rates',
  {
    currency: varchar('currency', { length: 3 }).notNull(),
    // Published day; there are no rows on weekends or TARGET2 holidays.
    date: date('date').notNull(),
    unitsPerEur: numeric('units_per_eur', { precision: 20, scale: 8 }).notNull(),
    // Source ("ecb").
    source: varchar('source', { length: 10 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.currency, table.date] })],
);

/**
 * Range already downloaded for each currency. Without it, an empty series (a currency the ECB does
 * not publish) or a gap could not tell "does not exist" from "never requested", and it would be
 * requested again every time.
 */
export const fxReferenceCoverage = pgTable('fx_reference_coverage', {
  currency: varchar('currency', { length: 3 }).primaryKey(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Splits: closes come adjusted and lot quantities are raw, so the history needs them to express
 * lots in today's shares (`@sextante/core/portfolio/history-reconstruction`). `ratio` = new shares
 * per old one (10 in a 10:1); `date` = first trading day with the split (UTC).
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
 * Dividend per share of each payment, according to the price source (Yahoo `events=div`), in the
 * symbol's quote currency and ADJUSTED for later splits (as Yahoo provides it): undone with
 * `instrument_splits`. An independent cross-check of the gross amount the broker reports
 * (`@sextante/core/fiscal/dividend-resolution`). Refreshed together with the splits.
 */
export const instrumentDividends = pgTable(
  'instrument_dividends',
  {
    symbol: varchar('symbol', { length: 40 }).notNull(),
    // Ex-dividend date (UTC), as given by Yahoo.
    exDate: date('ex_date').notNull(),
    amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.symbol, table.exDate] })],
);

/** "Splits checked" marker: an empty `instrument_splits` cannot tell "no splits" from "never checked", nor would it see a split after priming. */
export const instrumentSplitChecks = pgTable('instrument_split_checks', {
  symbol: varchar('symbol', { length: 40 }).primaryKey(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Permanent cache of ticker/ISIN → symbol resolution (expensive and stable). `query` is the
 * normalised user input; a NULL `symbol` caches a confirmed "not found". Transient failures write
 * no row so as not to block a valid symbol.
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
 * MCP / OAuth 2.1 (`_local/mcp-integracion.md`): the SDK mounts the Authorization Server and we
 * provide the provider. The `userId` travels in the token and every tool filters by it; audience
 * binding to `…/api/mcp`; tokens and codes stored hashed only (SHA-256), like `login_tokens`.
 */

/**
 * OAuth clients (Dynamic Client Registration, RFC 7591), stored as `jsonb` because that is what
 * the SDK's `clientsStore` reads and writes. They are anonymous: consent lives in `oauth_grants`.
 * Public clients use PKCE without a `client_secret`; if there is one, the SDK compares it in
 * plain text and it is kept in the JSON (PKCE is the real barrier).
 */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').$type<OAuthClientInformationFull>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

/** Consents (GDPR legal basis; revoked under "Connected apps"). Unique per `(userId, clientId)`: scopes are updated in place. */
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
 * Authorisation codes (PKCE): short-lived, single-use and stored hashed only. Bound to
 * `(clientId, redirectUri, codeChallenge, resource, userId)` so the exchange can check that nothing
 * changed between `/authorize` and `/token`. The SDK validates the `code_verifier`; we handle the
 * rest and the atomic single use (`UPDATE … WHERE consumedAt IS NULL … RETURNING`).
 */
export const oauthAuthCodes = pgTable(
  'oauth_auth_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    codeChallenge: text('code_challenge').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    // Canonical resource URI (RFC 8707) requested at `/authorize`; propagated to the token.
    resource: text('resource'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The hourly pruning in `jobs/data-retention.ts` deletes expired rows.
  (table) => [index('oauth_auth_codes_expires_at_idx').on(table.expiresAt)],
);

/**
 * Access and refresh tokens, stored hashed only. `verifyAccessToken` resolves the Bearer to a
 * `userId` and rejects it if the `audience` (RFC 8707) is not our `…/api/mcp`. Refresh with
 * rotation: on exchange, `consumedAt` is set and a new one chained by `parentHash` is issued, which
 * makes it possible to detect reuse of a spent refresh token and cut the chain.
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
    // Hash of the parent refresh token (rotation); null for the first one.
    parentHash: text('parent_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('oauth_tokens_user_id_idx').on(table.userId),
    index('oauth_tokens_user_client_idx').on(table.userId, table.clientId),
    // The hourly pruning in `jobs/data-retention.ts` deletes expired rows.
    index('oauth_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

/** Audit log of MCP calls (user, client, tool, outcome): metadata only, no portfolio data. */
export const mcpAuditLog = pgTable(
  'mcp_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    tool: varchar('tool', { length: 64 }).notNull(),
    // 'ok' | 'error' | 'denied_scope' (write tool without the portfolio:write permission).
    outcome: varchar('outcome', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mcp_audit_log_user_id_idx').on(table.userId),
    // The table grows without bound and `jobs/data-retention.ts` prunes it by date: without this
    // index that purge and range queries would seq scan. Descending: recent rows are what is queried.
    index('mcp_audit_log_created_at_idx').on(table.createdAt.desc()),
  ],
);

/**
 * Email preferences (no row means everything off: opt-in). `lastFireMilestone` is the last FIRE
 * milestone (25/50/75/100 %) notified and only goes up; `null` = no baseline, and the first
 * evaluation after enabling alerts sets it without sending anything. `fireGoalRef`
 * (`<scenario id>@<updatedAt>`) identifies the goal version of that baseline: if it changes, the
 * baseline is reset silently (raising the goal after 100 % must not silence the alerts, nor must
 * lowering it trigger one). No unsubscribe token is stored: the link carries an HMAC of the `userId`.
 */
export const userNotificationSettings = pgTable('user_notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fireAlertsEnabled: boolean('fire_alerts_enabled').notNull().default(false),
  /** Email language (`es`/`en`): the UI language when the user enabled them. */
  locale: varchar('locale', { length: 5 }).notNull().default('es'),
  lastFireMilestone: smallint('last_fire_milestone'),
  fireGoalRef: text('fire_goal_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
