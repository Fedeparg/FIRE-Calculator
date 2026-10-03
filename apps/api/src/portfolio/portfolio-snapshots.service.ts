import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { asc, eq, min, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions } from '../db/schema.js';
import {
  LOT_CHANGED_EVENT,
  POSITION_CREATED_EVENT,
  type LotChangedEvent,
  type PositionCreatedEvent,
} from '../positions/position-events.js';
import { PositionsService } from '../positions/positions.service.js';
import { HISTORY_MAX_DAYS, PriceHistoryService } from '../prices/price-history.service.js';
import { PriceReadService } from '../prices/price-read.service.js';
import { PortfolioValuationService, type MarketData } from './portfolio-valuation.service.js';
import { SnapshotRebuildQueue } from './snapshot-rebuild.queue.js';
import { SnapshotRepository, type SnapshotInsert } from './snapshot.repository.js';
import { convertCurrency } from '@sextante/core/fx';
import {
  firstTradeDate,
  reconstructHistory,
  type HistoryLot,
  type HistoryPosition,
} from '@sextante/core/portfolio/history-reconstruction';
import type { HistoryPointDto, PortfolioHistoryDto } from '@sextante/core/portfolio/types';
import { planSnapshotWrites, staleSnapshotDates } from '@sextante/core/portfolio/staleness';
import { addDays, isoDate, todayUtc } from '../common/dates.js';
import { errorMessage } from '../common/errors.js';

/**
 * Base currency of the history: `portfolio_snapshots` is always stored in euros so it does not
 * depend on the currency selected on the capture day. Any other currency is re-expressed with
 * the FX rates each snapshot stored for its day (see `history`).
 */
export const SNAPSHOT_BASE_CURRENCY = 'EUR';

/** Default history range, in days (the maximum lives in `price-history.service.ts`). */
export const HISTORY_DEFAULT_DAYS = 365;
export { HISTORY_MAX_DAYS };

/** Summary of one run of the daily capture (for the cron logs). */
export interface SnapshotSummary {
  date: string;
  users: number;
  captured: number;
  failed: number;
}

/** Upper bound of `numeric(20,8)`: 12 integer digits. */
const MAX_SNAPSHOT_AMOUNT = 1e12;

/** Formats for `numeric(20,8)`; `null` if not finite or it does not fit (better not to store than to invent or crash the driver). */
function toNumeric(value: number): string | null {
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_SNAPSHOT_AMOUNT) return null;
  return value.toFixed(8);
}

/**
 * Valuation history: one row per user and day. Reuses `PortfolioValuationService`, so today's
 * point always matches the total the portfolio shows.
 */
@Injectable()
export class PortfolioSnapshotsService {
  private readonly logger = new Logger(PortfolioSnapshotsService.name);
  /** Per-user coalescing of rebuilds after lot changes (see `onLotChanged`). */
  private readonly rebuilds = new SnapshotRebuildQueue();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly valuation: PortfolioValuationService,
    private readonly prices: PriceReadService,
    private readonly priceHistory: PriceHistoryService,
    private readonly positionsService: PositionsService,
    private readonly repository: SnapshotRepository,
  ) {}

  /**
   * Captures today's snapshot for every user with positions (daily job, after the price
   * refresh). Each user runs in its own `try`: one with odd data does not block the rest.
   * Users without positions are skipped: a row of zeros would pollute their series.
   */
  async captureAll(): Promise<SnapshotSummary> {
    const date = todayUtc();
    const userIds = await this.usersWithPositions();
    // Prices and FX for the whole pass in one read, not two queries per user.
    const tickers = await this.db.selectDistinct({ ticker: positions.ticker }).from(positions);
    const market = await this.valuation.loadMarketData(tickers.map((row) => row.ticker));

    let captured = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.captureUser(userId, date, market);
        captured += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Portfolio snapshot failed (user ${userId}): ${errorMessage(error)}`);
      }
    }

    const summary: SnapshotSummary = { date, users: userIds.length, captured, failed };
    this.logger.log(
      `Portfolio snapshots ${date}: ${captured}/${userIds.length} captured` + (failed ? ` — ${failed} failed` : ''),
    );
    return summary;
  }

  /**
   * Captures a user's snapshot for a date. Idempotent: upsert by `(userId, date)`.
   * `market`: prices and FX already read for the whole pass (see `captureAll`).
   */
  async captureUser(userId: string, date: string = todayUtc(), market?: MarketData): Promise<void> {
    const valuation = await this.valuation.valuate(userId, SNAPSHOT_BASE_CURRENCY, market);
    const { rates } = market?.fx ?? (await this.prices.getFxRates());

    const invested = toNumeric(valuation.aggregate.invested);
    const marketValue = toNumeric(valuation.aggregate.marketValue);
    if (invested === null || marketValue === null) {
      throw new Error('The valuation does not fit in the snapshot (non-finite or overflowing amount)');
    }

    const row: SnapshotInsert = {
      userId,
      date,
      invested,
      marketValue,
      valuedPositions: valuation.aggregate.valued,
      totalPositions: valuation.aggregate.total,
      fxRates: rates,
      // Real capture: never an estimate, and it replaces any estimated row for that day.
      estimated: false,
    };

    await this.repository.upsertCapture(row);
  }

  /**
   * Rebuilds a user's history from their first trade (capped at `HISTORY_MAX_DAYS`) up to
   * yesterday, valuing each day the quantity and cost held on that day (without inventing
   * history). The pure logic lives in `@sextante/core/portfolio/history-reconstruction`, which also
   * documents splits and their limits. It only writes what changed (nothing, on a normal nightly
   * pass), so it always runs: on creation, import, lot edit, startup and cron.
   *
   * "Estimated" = before `trackingSince` (UTC date of the oldest `created_at` among their
   * positions); each row carries `estimated = (date < trackingSince)`. From that date on the series
   * is considered reliable even if the rebuild redoes it: the user was already using Sextante and
   * the value is essentially what the cron would have captured. That is why later gaps filled by
   * the backfill stay `estimated = false` (accepted trade-off: we do not tell "cron down" apart
   * from "real capture"). Frontend and MCP flag it.
   *
   * Self-repair: an estimated row whose `estimated` breaks the rule counts as changed and is
   * fixed on the first pass; estimates that no longer come out of the rebuild are removed. If
   * the rebuild comes out empty (no prices yet because `primeSymbol` is still fetching
   * history) nothing is touched.
   *
   * Stale real captures: a real one is only kept while it is a faithful snapshot. If a trade dated
   * <= the capture date was recorded afterwards, that capture would show a false step and is
   * replaced by the rebuild (rule in `@sextante/core/portfolio/staleness`). Deleting a lot leaves
   * no trace, so the caller passes `invalidateFrom`. Non-stale real rows are never touched, and if
   * a stale day does not come out of the rebuild the real one is kept: better an outdated value
   * than deleting one we cannot redo.
   *
   * A ticker or currency without a close/rate on a given day leaves that position unvalued
   * (`valuedPositions < totalPositions`), like the daily capture.
   */
  async backfillUser(userId: string, options: { invalidateFrom?: string | null } = {}): Promise<void> {
    // Ticker → symbol resolution happens before opening the transaction: inside it, it would
    // request a second connection and would deadlock with an exhausted pool.
    const tickers = (
      await this.db.select({ ticker: positions.ticker }).from(positions).where(eq(positions.userId, userId))
    ).map((p) => p.ticker);
    const tickerToSymbol = await this.prices.resolveCachedTickers([...new Set(tickers)]);

    // Per-user advisory lock: two concurrent rebuilds would read different lots and the last one
    // to write could leave the old state. It is released when the transaction ends; lots are read
    // inside it to see the latest committed data.
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

      const owned = await tx.select().from(positions).where(eq(positions.userId, userId));
      if (owned.length === 0) return;

      const lotRows = await tx
        .select()
        .from(positionLots)
        .where(eq(positionLots.userId, userId))
        // Canonical `compareLots` order: the same-day tie-break matters.
        .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));
      const lotsByPosition = new Map<string, HistoryLot[]>();
      for (const row of lotRows) {
        const list = lotsByPosition.get(row.positionId) ?? [];
        list.push({
          kind: row.kind,
          quantity: Number(row.quantity),
          price: Number(row.price),
          tradedAt: row.tradedAt,
        });
        lotsByPosition.set(row.positionId, list);
      }

      const historyPositions: HistoryPosition[] = owned.map((p) => ({
        ticker: p.ticker,
        currency: p.currency,
        isDerivative: p.isDerivative,
        // No lots (predates the lot model): a single buy on the creation date.
        lots: lotsByPosition.get(p.id) ?? [
          {
            kind: 'buy',
            quantity: Number(p.quantity),
            price: Number(p.avgPrice),
            tradedAt: isoDate(p.createdAt),
          },
        ],
      }));

      // Start of tracking in Sextante, not of the trades.
      const trackingSince = isoDate(new Date(Math.min(...owned.map((p) => p.createdAt.getTime()))));

      const earliest = firstTradeDate(historyPositions);
      if (earliest === null) return;
      const floor = addDays(todayUtc(), -HISTORY_MAX_DAYS);
      const from = earliest > floor ? earliest : floor;
      const to = addDays(todayUtc(), -1); // yesterday: today belongs to the cron
      if (from > to) return;

      const series = await this.prices.getSeriesSince(tickerToSymbol, from, tx);
      const days = reconstructHistory({
        positions: historyPositions,
        prices: series.prices,
        fx: series.fx,
        splits: series.splits,
        from,
        to,
        display: SNAPSHOT_BASE_CURRENCY,
      });

      const rows = days.flatMap(({ date, aggregate, rates }) => {
        const invested = toNumeric(aggregate.invested);
        const marketValue = toNumeric(aggregate.marketValue);
        if (invested === null || marketValue === null) return []; // overflow: skip that day
        return [
          {
            userId,
            date,
            invested,
            marketValue,
            valuedPositions: aggregate.valued,
            totalPositions: aggregate.total,
            fxRates: rates,
          },
        ];
      });
      if (rows.length === 0) return;

      // Only the difference from what is stored gets written (`planSnapshotWrites`). `readAt` is
      // taken before the read: a real row rewritten by the nightly capture after it was read is
      // fresh and must not be overwritten (see `upsertReconstructed`).
      const readAt = new Date();
      const existing = await this.repository.loadExisting(tx, userId);
      const staleReal = staleSnapshotDates({
        snapshots: existing
          .filter((row) => !row.estimated)
          .map((row) => ({ date: row.date, writtenAt: row.updatedAt.getTime() })),
        lots: lotRows.map((lot) => ({
          tradedAt: lot.tradedAt,
          changedAt: Math.max(lot.createdAt.getTime(), lot.updatedAt.getTime()),
        })),
        invalidateFrom: options.invalidateFrom ?? null,
      });
      const { changed, stale } = planSnapshotWrites({ rows, existing, staleReal, trackingSince });

      await this.repository.upsertReconstructed(tx, changed, staleReal, readAt);
      await this.repository.deleteEstimated(tx, userId, stale);
    });
  }

  /** Backfill for every user with positions, isolated per user. */
  async backfillAll(): Promise<void> {
    const userIds = await this.usersWithPositions();
    let backfilled = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.backfillUser(userId);
        backfilled += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Portfolio backfill failed (user ${userId}): ${errorMessage(error)}`);
      }
    }
    this.logger.log(`History backfill: ${backfilled}/${userIds.length} users` + (failed ? ` — ${failed} failed` : ''));
  }

  /** Rebuilds the history after a creation (see `position-events.ts`). Must never break the flow that fired the event. */
  @OnEvent(POSITION_CREATED_EVENT)
  async onPositionCreated({ userId }: PositionCreatedEvent): Promise<void> {
    try {
      await this.backfillUser(userId);
    } catch (error) {
      this.logger.warn(`Backfill after position creation failed (user ${userId}): ${errorMessage(error)}`);
    }
  }

  /** A lot changed: fetches any missing price history and rebuilds the series. Fault-tolerant. */
  @OnEvent(LOT_CHANGED_EVENT)
  async onLotChanged({ userId, positionId, invalidateFrom }: LotChangedEvent): Promise<void> {
    await this.rebuilds.enqueue(
      userId,
      { positionId, invalidateFrom },
      async ({ positionIds, invalidateFrom: from }) => {
        for (const id of positionIds) await this.ensureLotHistory(id);
        await this.backfillUser(userId, { invalidateFrom: from });
      },
      (error) => this.logger.warn(`Rebuild after a lot change failed (user ${userId}): ${errorMessage(error)}`),
    );
  }

  private async ensureLotHistory(positionId: string): Promise<void> {
    const [position] = await this.db.select().from(positions).where(eq(positions.id, positionId));
    const [first] = await this.db
      .select({ firstTrade: min(positionLots.tradedAt) })
      .from(positionLots)
      .where(eq(positionLots.positionId, positionId));
    if (position && first?.firstTrade) {
      await this.priceHistory.ensureHistoryForTicker(position.ticker, first.firstTrade);
    }
  }

  /**
   * Series of the last `days` days, oldest first, re-expressed in `display` with the rates each
   * snapshot stored (not today's): the chart reflects what the portfolio was worth on that day
   * in that currency.
   */
  async history(
    userId: string,
    days: number = HISTORY_DEFAULT_DAYS,
    display: string = SNAPSHOT_BASE_CURRENCY,
  ): Promise<PortfolioHistoryDto> {
    const span = Math.min(Math.max(Math.trunc(days), 1), HISTORY_MAX_DAYS);
    const from = addDays(todayUtc(), -span);

    const rows = await this.repository.listSince(userId, from);

    const points = rows.map((row): HistoryPointDto => {
      const invested = convertCurrency(Number(row.invested), SNAPSHOT_BASE_CURRENCY, display, row.fxRates);
      const marketValue = convertCurrency(Number(row.marketValue), SNAPSHOT_BASE_CURRENCY, display, row.fxRates);
      const pnlAbs = invested !== null && marketValue !== null ? marketValue - invested : null;
      return {
        date: row.date,
        invested,
        marketValue,
        pnlAbs,
        pnlPct: pnlAbs !== null && invested !== null && invested > 0 ? (pnlAbs / invested) * 100 : null,
        valuedPositions: row.valuedPositions,
        totalPositions: row.totalPositions,
        estimated: row.estimated,
      };
    });

    return { display, base: SNAPSHOT_BASE_CURRENCY, points };
  }

  /** Users with at least one position. */
  private async usersWithPositions(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ userId: positions.userId }).from(positions);
    return rows.map((row) => row.userId);
  }
}
