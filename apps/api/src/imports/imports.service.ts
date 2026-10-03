import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  parseTradeRepublicCsv,
  TradeRepublicParseError,
  type TradeRepublicParseErrorCode,
} from '@sextante/core/imports/trade-republic';
import type {
  ImportedAssetClass,
  ImportedIncome,
  ImportedTrade,
  ImportIncomeSummary,
  ImportFailureCode,
  ImportParseResult,
  ImportPlan,
  ImportPlanPosition,
  ImportResult,
  ImportResultPosition,
  ImportSkipReason,
  SkippedSummary,
} from '@sextante/core/imports/types';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { positionLots, positions, type Position, type PositionLot } from '../db/schema.js';
import { DividendResolutionService } from '../income/dividend-resolution.service.js';
import { IncomeService } from '../income/income.service.js';
import { PricesService } from '../prices/prices.service.js';
import { aggregateLots, LotAggregateError } from '../positions/lot-aggregate.js';
import { type DatabaseOrTransaction } from '../positions/position-access.js';
import {
  LOT_CHANGED_EVENT,
  POSITION_CREATED_EVENT,
  type LotChangedEvent,
  type PositionCreatedEvent,
} from '../positions/position-events.js';
import { PositionLotsService } from '../positions/position-lots.service.js';

/** Bróker de la importación: nombre de la posición y prefijo de los ids externos. */
export const TRADE_REPUBLIC_BROKER = 'Trade Republic';
const EXTERNAL_ID_PREFIX = 'trade-republic:';
/** `positions.name` es `varchar(100)`. */
const NAME_MAX_LENGTH = 100;
/** Tope de ISINs distintos: un export real tiene decenas; evita un `IN (...)` descomunal desde un fichero malicioso. */
const MAX_INSTRUMENTS = 2_000;

/** Operaciones de un ISIN, separadas entre las que faltan por importar y las ya importadas. */
type InstrumentGroup = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  fresh: ImportedTrade[];
  duplicates: number;
};

/**
 * Importación desde Trade Republic, sin estado: vista previa y confirmación reciben el mismo
 * CSV y lo reparsean, así que no se guarda nada entre ellas y el export solo vive lo que dura
 * la petición. Los lotes entran con `PositionLotsService.appendImported` y la posición se
 * recalcula con el mismo `recompute` que las altas manuales.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly lots: PositionLotsService,
    private readonly prices: PricesService,
    private readonly events: EventEmitter2,
    private readonly income: IncomeService,
    private readonly dividends: DividendResolutionService,
  ) {}

  /** Calcula qué haría la confirmación, sin escribir nada. */
  async preview(userId: string, csv: string): Promise<ImportPlan> {
    const parsed = parseOrThrow(csv);
    const groups = await this.groupByInstrument(userId, parsed.trades);
    const existing = await this.findExistingPositions(userId, groups);

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
   * Escribe la importación en una transacción por posición: si una queda en negativo solo esa
   * se revierte y se informa. Idempotente por `external_id`.
   */
  async confirm(userId: string, csv: string): Promise<ImportResult> {
    const parsed = parseOrThrow(csv);
    const groups = await this.groupByInstrument(userId, parsed.trades);

    const results: ImportResultPosition[] = [];
    const created: Position[] = [];
    const extended: Position[] = [];

    for (const group of groups) {
      if (group.fresh.length === 0) {
        // Reimportar el mismo fichero también completa la clase de activo que falte.
        await this.backfillAssetClass(this.db, userId, group);
        results.push(resultOf(group, 'unchanged', 0, null, null));
        continue;
      }
      try {
        const outcome = await this.db.transaction((tx) => this.importInstrument(tx, userId, group));
        if (outcome.wasCreated) created.push(outcome.position);
        else if (outcome.inserted > 0) extended.push(outcome.position);
        results.push(
          resultOf(
            group,
            outcome.inserted === 0 ? 'unchanged' : outcome.wasCreated ? 'created' : 'extended',
            outcome.inserted,
            Number(outcome.position.quantity),
            null,
          ),
        );
      } catch (error) {
        const failure = failureOf(error);
        if (failure === 'UNEXPECTED') {
          // No se vuelca el mensaje de la BD (puede incluir valores de la fila): solo el tipo.
          this.logger.error(
            `Importación de una posición fallida: ${error instanceof Error ? error.name : 'error desconocido'}`,
          );
        }
        results.push(resultOf(group, 'failed', 0, null, failure));
      }
    }

    if (created.length > 0) {
      // Los derivados no se valoran: no se piden sus precios. Al terminar, resuelve los dividendos.
      void this.primeInBackground(
        userId,
        created.filter((p) => !p.isDerivative),
      );
    } else {
      void this.resolveDividendsInBackground(userId);
    }

    // Después de las posiciones: un dividendo se enlaza con la posición de su ISIN, aunque sea nueva.
    const income = await this.importIncome(userId, parsed.income);

    // Importar sobre posiciones que ya existían puede traer operaciones antiguas: se rehace el
    // histórico al momento (las nuevas ya lo hacen con `POSITION_CREATED_EVENT`).
    for (const position of extended) {
      this.events.emit(LOT_CHANGED_EVENT, {
        userId,
        positionId: position.id,
      } satisfies LotChangedEvent);
    }

    return {
      broker: TRADE_REPUBLIC_BROKER,
      positions: results,
      totals: {
        lotsCreated: sum(results.map((r) => r.lotsCreated)),
        duplicates: sum(results.map((r) => r.duplicates)),
        failedPositions: results.filter((r) => r.status === 'failed').length,
      },
      income,
      skipped: summarizeSkipped(parsed),
      warnings: parsed.warnings,
    };
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

  /**
   * Guarda los cobros en una transacción, enlazando cada uno con la posición de Trade Republic de su
   * ISIN si la hay. Idempotente por `external_id`.
   */
  private async importIncome(userId: string, items: readonly ImportedIncome[]): Promise<ImportIncomeSummary> {
    if (items.length === 0) return { created: 0, duplicates: 0, reportedToAeat: 0 };
    const known = await this.income.findImportedIds(userId, items.map(incomeExternalIdOf));
    const fresh = items.filter((item) => !known.has(incomeExternalIdOf(item)));
    const isins = [...new Set(fresh.map((item) => item.isin).filter((isin): isin is string => isin !== null))];
    const positionByIsin = new Map<string, string>();
    if (isins.length > 0) {
      const rows = await this.db
        .select({ id: positions.id, ticker: positions.ticker })
        .from(positions)
        .where(
          and(
            eq(positions.userId, userId),
            inArray(positions.ticker, isins),
            sql`lower(${positions.broker}) = lower(${TRADE_REPUBLIC_BROKER})`,
          ),
        );
      for (const row of rows) positionByIsin.set(row.ticker, row.id);
    }

    const created = await this.db.transaction((tx) =>
      this.income.appendImported(
        tx,
        userId,
        fresh.map((item) => ({
          ...item,
          externalId: incomeExternalIdOf(item),
          positionId: item.isin ? (positionByIsin.get(item.isin) ?? null) : null,
        })),
      ),
    );
    return {
      created,
      // Incluye lo que otra petición concurrente importó entre la lectura y la escritura.
      duplicates: items.length - created,
      reportedToAeat: fresh.filter((item) => item.reportedToAeat).length,
    };
  }

  private async importInstrument(
    tx: DatabaseOrTransaction,
    userId: string,
    group: InstrumentGroup,
  ): Promise<{ position: Position; wasCreated: boolean; inserted: number }> {
    let position = await this.findPosition(tx, userId, group.isin);
    const wasCreated = position === undefined;

    if (position === undefined) {
      [position] = await tx
        .insert(positions)
        .values({
          userId,
          ticker: group.isin,
          name: group.name.slice(0, NAME_MAX_LENGTH) || null,
          // La foto real la escribe `appendImported` al recalcular; aquí solo el hueco.
          quantity: '0',
          avgPrice: '0',
          broker: TRADE_REPUBLIC_BROKER,
          currency: 'EUR',
          isDerivative: group.assetClass === 'derivative',
          assetClass: group.assetClass,
        })
        .returning();
    }

    if (!wasCreated) position = (await this.backfillAssetClass(tx, userId, group)) ?? position;

    const { inserted } = await this.lots.appendImported(tx, {
      positionId: position.id,
      userId,
      lots: group.fresh.map(toLotInput),
    });

    if (wasCreated && inserted === 0) {
      // Otra petición concurrente ya había importado todos estos lotes: no dejar una posición vacía.
      await tx.delete(positions).where(eq(positions.id, position.id));
      return { position, wasCreated: false, inserted };
    }

    const [fresh] = await tx.select().from(positions).where(eq(positions.id, position.id));
    return { position: fresh, wasCreated, inserted };
  }

  /**
   * Precios de las posiciones nuevas y backfill, sin hacer esperar la respuesta (red, una
   * llamada por ISIN); secuencial para no ráfagear Yahoo. El refresco diario repara lo que falle.
   */
  private async primeInBackground(userId: string, created: readonly Position[]): Promise<void> {
    try {
      for (const position of created) {
        await this.prices.primeSymbol(position.ticker, position.currency);
      }
      this.events.emit(POSITION_CREATED_EVENT, { userId } satisfies PositionCreatedEvent);
      await this.resolveDividendsInBackground(userId);
    } catch (error) {
      this.logger.warn(
        `Refresco de precios tras importar falló: ${error instanceof Error ? error.name : 'error desconocido'}`,
      );
    }
  }

  /** Da la clase de activo del bróker a una posición importada antes de que se guardara; devuelve la posición. */
  private async backfillAssetClass(
    db: DatabaseOrTransaction,
    userId: string,
    group: InstrumentGroup,
  ): Promise<Position | undefined> {
    const position = await this.findPosition(db, userId, group.isin);
    if (!position || position.assetClass !== null) return position;
    const [updated] = await db
      .update(positions)
      .set({ assetClass: group.assetClass })
      .where(eq(positions.id, position.id))
      .returning();
    return updated;
  }

  /** Completa los dividendos con los datos de mercado ya cacheados; un fallo no afecta a la importación. */
  private async resolveDividendsInBackground(userId: string): Promise<void> {
    try {
      await this.dividends.resolvePending(userId);
    } catch (error) {
      this.logger.warn(
        `Resolución de dividendos tras importar falló: ${error instanceof Error ? error.name : 'error desconocido'}`,
      );
    }
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
    // Por lotes: un export grande no debe generar un IN de miles de parámetros.
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
          sql`lower(${positions.broker}) = lower(${TRADE_REPUBLIC_BROKER})`,
        ),
      );
    return new Map(rows.map((row) => [row.ticker, row]));
  }

  private async findPosition(db: DatabaseOrTransaction, userId: string, isin: string): Promise<Position | undefined> {
    const [row] = await db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.ticker, isin),
          sql`lower(${positions.broker}) = lower(${TRADE_REPUBLIC_BROKER})`,
        ),
      );
    return row;
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
      byPosition.set(row.positionId, [...(byPosition.get(row.positionId) ?? []), row]);
    }
    return byPosition;
  }
}

const ID_BATCH_SIZE = 500;

function externalIdOf(trade: ImportedTrade): string {
  return `${EXTERNAL_ID_PREFIX}${trade.externalId}`;
}

function incomeExternalIdOf(item: ImportedIncome): string {
  return `${EXTERNAL_ID_PREFIX}${item.externalId}`;
}

function toLotInput(trade: ImportedTrade) {
  return {
    externalId: externalIdOf(trade),
    kind: trade.kind,
    quantity: trade.quantity,
    price: trade.price,
    fees: trade.fees,
    tradedAt: trade.tradedAt,
  };
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

/** Traduce el error de una transacción de posición al código que ve el usuario. */
function failureOf(error: unknown): ImportFailureCode {
  if (error instanceof BadRequestException) {
    const body = error.getResponse();
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    if (code === 'NEGATIVE_QUANTITY') return 'NEGATIVE_QUANTITY';
    if (code === 'OVERFLOW') return 'OVERFLOW';
  }
  return 'UNEXPECTED';
}

function resultOf(
  group: InstrumentGroup,
  status: ImportResultPosition['status'],
  lotsCreated: number,
  quantity: number | null,
  failure: ImportFailureCode | null,
): ImportResultPosition {
  return {
    isin: group.isin,
    name: group.name,
    status,
    lotsCreated,
    // Incluye lo que otra petición concurrente importó entre el reparto y la escritura.
    duplicates: group.duplicates + (status === 'failed' ? 0 : group.fresh.length - lotsCreated),
    quantity,
    failure,
  };
}

const PARSE_ERROR_MESSAGES: Record<TradeRepublicParseErrorCode, string> = {
  EMPTY_FILE: 'El fichero está vacío o no contiene operaciones',
  MALFORMED_CSV: 'El fichero no es un CSV válido',
  NOT_TRADE_REPUBLIC: 'El fichero no es una exportación de transacciones de Trade Republic',
  TOO_MANY_ROWS: 'El fichero tiene demasiadas filas',
};

/** Reparsea el CSV traduciendo los errores del parser a 400 con código estable. */
function parseOrThrow(csv: string): ImportParseResult {
  try {
    return parseTradeRepublicCsv(csv);
  } catch (error) {
    if (error instanceof TradeRepublicParseError) {
      // El mensaje del parser va en inglés para logs; al usuario le llega el código y un texto fijo.
      throw new BadRequestException({ code: error.code, message: PARSE_ERROR_MESSAGES[error.code] });
    }
    throw error;
  }
}

function summarizeSkipped(parsed: ImportParseResult): SkippedSummary[] {
  const counts = new Map<ImportSkipReason, number>();
  for (const row of parsed.skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
