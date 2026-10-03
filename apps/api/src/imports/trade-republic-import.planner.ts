import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  ImportedIncome,
  ImportedTrade,
  ImportFailureCode,
  ImportIncomeSummary,
  ImportParseResult,
  ImportPlan,
  ImportPlanPosition,
  ImportSkipReason,
  SkippedSummary,
} from '@sextante/core/imports/types';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions, type Position, type PositionLot } from '../db/schema.js';
import { IncomeService } from '../income/income.service.js';
import { aggregateLots, LotAggregateError } from '../positions/lot-aggregate.js';
import { brokerEquals } from '../positions/position-access.js';
import {
  externalIdOf,
  incomeExternalIdOf,
  sum,
  TRADE_REPUBLIC_BROKER,
  type InstrumentGroup,
} from './trade-republic-import.model.js';

/** Cap on distinct ISINs: a real export has dozens; prevents a huge `IN (...)` from a malicious file. */
const MAX_INSTRUMENTS = 2_000;
/** In batches: a large export must not produce an IN with thousands of parameters. */
const ID_BATCH_SIZE = 500;

/** The file's instruments, already split into new/duplicate, with their Trade Republic position if any. */
export type LoadedInstruments = {
  groups: InstrumentGroup[];
  /** Existing position by ISIN. */
  existing: Map<string, Position>;
};

/**
 * READ side of the Trade Republic import: groups the trades by ISIN, separates what was already
 * imported and computes the preview (what the confirm would do) without writing anything. The
 * confirm reuses `loadInstruments` to start from exactly the same split.
 */
@Injectable()
export class TradeRepublicImportPlanner {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly income: IncomeService,
  ) {}

  /** Import plan: which positions are created or extended, with what result, and which payments go in. */
  async plan(userId: string, parsed: ImportParseResult): Promise<ImportPlan> {
    const { groups, existing } = await this.loadInstruments(userId, parsed.trades);
    const lotsByPosition = await this.selectLotsByPosition([...existing.values()]);

    const planned: ImportPlanPosition[] = [];
    for (const group of groups) {
      const current = existing.get(group.isin);
      const currentLots = current ? (lotsByPosition.get(current.id) ?? []) : [];
      const simulation = simulate(currentLots, group.fresh);

      planned.push({
        isin: group.isin,
        name: group.name,
        assetClass: group.assetClass,
        action: current ? 'extend' : 'create',
        newBuys: group.fresh.filter((trade) => trade.kind === 'buy').length,
        newSells: group.fresh.filter((trade) => trade.kind === 'sell').length,
        duplicates: group.duplicates,
        currentQuantity: current ? Number(current.quantity) : 0,
        resultingQuantity: simulation.ok ? Number(simulation.quantity) : null,
        resultingAvgPrice: simulation.ok && Number(simulation.quantity) > 0 ? Number(simulation.avgPrice) : null,
        blockedBy: simulation.ok ? null : simulation.failure,
        isDerivative: group.assetClass === 'derivative',
      });
    }

    return {
      broker: TRADE_REPUBLIC_BROKER,
      positions: planned,
      totals: {
        newLots: sum(planned.map((p) => p.newBuys + p.newSells)),
        duplicates: sum(planned.map((p) => p.duplicates)),
      },
      income: await this.planIncome(userId, parsed.income),
      skipped: summarizeSkipped(parsed),
      warnings: parsed.warnings,
    };
  }

  /**
   * Groups the trades by ISIN (separating what was already imported) and loads the Trade Republic
   * positions of those ISINs in a single query, instead of one (or two) per instrument.
   */
  async loadInstruments(userId: string, trades: readonly ImportedTrade[]): Promise<LoadedInstruments> {
    const groups = await this.groupByInstrument(userId, trades);
    return { groups, existing: await this.findExistingPositions(userId, groups) };
  }

  /** Which income payments from the file would be created. */
  private async planIncome(userId: string, items: readonly ImportedIncome[]): Promise<ImportIncomeSummary> {
    const known = await this.income.findImportedIds(userId, items.map(incomeExternalIdOf));
    const fresh = items.filter((item) => !known.has(incomeExternalIdOf(item)));
    return {
      created: fresh.length,
      duplicates: items.length - fresh.length,
      reportedToAeat: fresh.filter((item) => item.reportedToAeat).length,
    };
  }

  /** Groups by ISIN and separates what was already imported from what is new. */
  private async groupByInstrument(userId: string, trades: readonly ImportedTrade[]): Promise<InstrumentGroup[]> {
    const isins = new Set(trades.map((trade) => trade.isin));
    if (isins.size > MAX_INSTRUMENTS) {
      throw new BadRequestException({
        code: 'TOO_MANY_INSTRUMENTS',
        message: 'El fichero tiene demasiados instrumentos distintos',
      });
    }

    const known = await this.findImportedIds(userId, trades);
    const groups = new Map<string, InstrumentGroup>();
    for (const trade of trades) {
      const group = groups.get(trade.isin) ?? {
        isin: trade.isin,
        name: trade.name,
        assetClass: trade.assetClass,
        fresh: [],
        duplicates: 0,
      };
      // Trades arrive sorted: the name and class of the LAST one are the current ones.
      group.name = trade.name || group.name;
      group.assetClass = trade.assetClass;
      if (known.has(externalIdOf(trade))) group.duplicates++;
      else group.fresh.push(trade);
      groups.set(trade.isin, group);
    }
    return [...groups.values()];
  }

  /** `external_id`s of the file's trades that the user has already imported. */
  private async findImportedIds(userId: string, trades: readonly ImportedTrade[]): Promise<Set<string>> {
    const known = new Set<string>();
    const ids = trades.map(externalIdOf);
    for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
      const rows = await this.db
        .select({ externalId: positionLots.externalId })
        .from(positionLots)
        .where(and(eq(positionLots.userId, userId), inArray(positionLots.externalId, ids.slice(i, i + ID_BATCH_SIZE))));
      for (const row of rows) if (row.externalId) known.add(row.externalId);
    }
    return known;
  }

  private async findExistingPositions(
    userId: string,
    groups: readonly InstrumentGroup[],
  ): Promise<Map<string, Position>> {
    if (groups.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          inArray(
            positions.ticker,
            groups.map((group) => group.isin),
          ),
          brokerEquals(TRADE_REPUBLIC_BROKER),
        ),
      );
    return new Map(rows.map((row) => [row.ticker, row]));
  }

  private async selectLotsByPosition(existing: readonly Position[]): Promise<Map<string, PositionLot[]>> {
    const byPosition = new Map<string, PositionLot[]>();
    if (existing.length === 0) return byPosition;
    const rows = await this.db
      .select()
      .from(positionLots)
      .where(
        inArray(
          positionLots.positionId,
          existing.map((position) => position.id),
        ),
      )
      .orderBy(asc(positionLots.tradedAt), asc(positionLots.createdAt), asc(positionLots.id));
    for (const row of rows) {
      const list = byPosition.get(row.positionId);
      if (list) list.push(row);
      else byPosition.set(row.positionId, [row]);
    }
    return byPosition;
  }
}

/** Simulates the confirm with the same aggregate as the real recompute, so preview and result never disagree. */
function simulate(
  currentLots: readonly PositionLot[],
  fresh: readonly ImportedTrade[],
): { ok: true; quantity: string; avgPrice: string } | { ok: false; failure: ImportFailureCode } {
  const base = Date.now();
  try {
    const aggregate = aggregateLots([
      ...currentLots,
      ...fresh.map((trade, i) => ({
        id: trade.externalId,
        kind: trade.kind,
        quantity: trade.quantity,
        price: trade.price,
        tradedAt: trade.tradedAt,
        createdAt: new Date(base + i),
      })),
    ]);
    return { ok: true, quantity: aggregate.quantity, avgPrice: aggregate.avgPrice };
  } catch (error) {
    if (error instanceof LotAggregateError) {
      return { ok: false, failure: error.code === 'NEGATIVE_QUANTITY' ? 'NEGATIVE_QUANTITY' : 'OVERFLOW' };
    }
    throw error;
  }
}

/** Rows skipped from the file, grouped by reason (most frequent first). */
export function summarizeSkipped(parsed: ImportParseResult): SkippedSummary[] {
  const counts = new Map<ImportSkipReason, number>();
  for (const row of parsed.skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
