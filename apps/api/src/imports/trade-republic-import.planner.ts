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

/** Tope de ISINs distintos: un export real tiene decenas; evita un `IN (...)` descomunal desde un fichero malicioso. */
const MAX_INSTRUMENTS = 2_000;
/** Por lotes: un export grande no debe generar un IN de miles de parámetros. */
const ID_BATCH_SIZE = 500;

/** Instrumentos del fichero ya separados en nuevo/duplicado, con su posición de Trade Republic si existe. */
export type LoadedInstruments = {
  groups: InstrumentGroup[];
  /** Posición existente por ISIN. */
  existing: Map<string, Position>;
};

/**
 * Lado de LECTURA de la importación de Trade Republic: agrupa las operaciones por ISIN, separa lo
 * ya importado y calcula la vista previa (qué haría la confirmación) sin escribir nada. La
 * confirmación reutiliza `loadInstruments` para partir exactamente del mismo reparto.
 */
@Injectable()
export class TradeRepublicImportPlanner {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly income: IncomeService,
  ) {}

  /** Plan de importación: qué posiciones se crean o amplían, con qué resultado y qué cobros entran. */
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
   * Agrupa las operaciones por ISIN (separando lo ya importado) y carga en una sola consulta las
   * posiciones de Trade Republic de esos ISIN, en vez de una (o dos) por instrumento.
   */
  async loadInstruments(userId: string, trades: readonly ImportedTrade[]): Promise<LoadedInstruments> {
    const groups = await this.groupByInstrument(userId, trades);
    return { groups, existing: await this.findExistingPositions(userId, groups) };
  }

  /** Qué cobros del fichero se crearían. */
  private async planIncome(userId: string, items: readonly ImportedIncome[]): Promise<ImportIncomeSummary> {
    const known = await this.income.findImportedIds(userId, items.map(incomeExternalIdOf));
    const fresh = items.filter((item) => !known.has(incomeExternalIdOf(item)));
    return {
      created: fresh.length,
      duplicates: items.length - fresh.length,
      reportedToAeat: fresh.filter((item) => item.reportedToAeat).length,
    };
  }

  /** Agrupa por ISIN y separa lo ya importado de lo nuevo. */
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
      // Las operaciones llegan ordenadas: el nombre y la clase de la ÚLTIMA son los vigentes.
      group.name = trade.name || group.name;
      group.assetClass = trade.assetClass;
      if (known.has(externalIdOf(trade))) group.duplicates++;
      else group.fresh.push(trade);
      groups.set(trade.isin, group);
    }
    return [...groups.values()];
  }

  /** `external_id` de las operaciones del fichero que el usuario ya tiene importadas. */
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

/** Simula la confirmación con el mismo agregado que el recálculo real, para que vista previa y resultado no discrepen. */
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

/** Filas descartadas del fichero, agrupadas por motivo (la más frecuente primero). */
export function summarizeSkipped(parsed: ImportParseResult): SkippedSummary[] {
  const counts = new Map<ImportSkipReason, number>();
  for (const row of parsed.skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
