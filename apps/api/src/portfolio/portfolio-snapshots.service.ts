import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, asc, eq, gte, inArray, lte, min, or, sql, type SQL } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots, positionLots, positions } from '../db/schema.js';
import {
  LOT_CHANGED_EVENT,
  POSITION_CREATED_EVENT,
  type LotChangedEvent,
  type PositionCreatedEvent,
} from '../positions/position-events.js';
import { PositionsService } from '../positions/positions.service.js';
import { HISTORY_MAX_DAYS, PricesService } from '../prices/prices.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import { convertCurrency } from '@sextante/core/fx';
import {
  firstTradeDate,
  reconstructHistory,
  type HistoryLot,
  type HistoryPosition,
} from '@sextante/core/portfolio/history-reconstruction';
import type { HistoryPointDto, PortfolioHistoryDto } from '@sextante/core/portfolio/types';
import { staleSnapshotDates } from '@sextante/core/portfolio/staleness';
import { isoDate, todayUtc } from '../common/dates.js';

/**
 * Divisa base del histórico: `portfolio_snapshots` se guarda siempre en euros para no depender
 * de la divisa seleccionada el día de la captura. Otra divisa se reexpresa con las tasas FX
 * que cada snapshot guardó de su día (ver `history`).
 */
export const SNAPSHOT_BASE_CURRENCY = 'EUR';

/** Rango por defecto del histórico, en días (el máximo vive en `prices.service.ts`). */
export const HISTORY_DEFAULT_DAYS = 365;
export { HISTORY_MAX_DAYS };

/** Filas por sentencia al escribir el histórico reconstruido (evita una sentencia por día). */
const UPSERT_CHUNK_SIZE = 200;

/** Resumen de una ejecución de la captura diaria (para los logs del cron). */
export interface SnapshotSummary {
  date: string;
  users: number;
  captured: number;
  failed: number;
}

/** Tope de `numeric(20,8)`: 12 dígitos enteros. */
const MAX_SNAPSHOT_AMOUNT = 1e12;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Igualdad de tasas FX (un `jsonb` no conserva el orden de las claves). */
function sameRates(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Fecha de hoy en UTC (`YYYY-MM-DD`), la misma referencia que `instrument_prices.date`. */

/** Formatea para `numeric(20,8)`; `null` si no es finito o no cabe (mejor no guardar que inventar o reventar el driver). */
function toNumeric(value: number): string | null {
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_SNAPSHOT_AMOUNT) return null;
  return value.toFixed(8);
}

/**
 * Histórico de valoración: una fila por usuario y día. Reutiliza `PortfolioValuationService`,
 * así que el punto de hoy coincide siempre con el total que muestra la cartera.
 */
@Injectable()
export class PortfolioSnapshotsService {
  private readonly logger = new Logger(PortfolioSnapshotsService.name);
  /** Usuarios con reconstrucción en curso → posiciones y fecha de lote borrado/movido anotadas (ver `onLotChanged`). */
  private readonly rebuilding = new Map<string, { positions: Set<string>; invalidateFrom: string | null }>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly valuation: PortfolioValuationService,
    private readonly prices: PricesService,
    private readonly positionsService: PositionsService,
  ) {}

  /**
   * Captura el snapshot de hoy de todos los usuarios con posiciones (job diario, tras el
   * refresco de precios). Cada usuario va en su `try`: uno con datos raros no impide el resto.
   * Los usuarios sin posiciones se omiten: una fila de ceros ensuciaría su serie.
   */
  async captureAll(): Promise<SnapshotSummary> {
    const date = todayUtc();
    const userIds = await this.usersWithPositions();

    let captured = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await this.captureUser(userId, date);
        captured += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Snapshot de cartera fallido (usuario ${userId}): ${(error as Error).message}`);
      }
    }

    const summary: SnapshotSummary = { date, users: userIds.length, captured, failed };
    this.logger.log(
      `Snapshots de cartera ${date}: ${captured}/${userIds.length} capturados` +
        (failed ? ` — ${failed} con error` : ''),
    );
    return summary;
  }

  /** Captura el snapshot de un usuario para una fecha. Idempotente: upsert por `(userId, date)`. */
  async captureUser(userId: string, date: string = todayUtc()): Promise<void> {
    const valuation = await this.valuation.valuate(userId, SNAPSHOT_BASE_CURRENCY);
    const { rates } = await this.prices.getFxRates();

    const invested = toNumeric(valuation.aggregate.invested);
    const marketValue = toNumeric(valuation.aggregate.marketValue);
    if (invested === null || marketValue === null) {
      throw new Error('La valoración no cabe en el snapshot (importe no finito o desbordado)');
    }

    const row = {
      userId,
      date,
      invested,
      marketValue,
      valuedPositions: valuation.aggregate.valued,
      totalPositions: valuation.aggregate.total,
      fxRates: rates,
      // Captura real: nunca es estimación y sustituye cualquier fila estimada de ese día.
      estimated: false,
    };

    await this.db
      .insert(portfolioSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [portfolioSnapshots.userId, portfolioSnapshots.date],
        set: {
          invested: row.invested,
          marketValue: row.marketValue,
          valuedPositions: row.valuedPositions,
          totalPositions: row.totalPositions,
          fxRates: row.fxRates,
          estimated: false,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Reconstruye el histórico de un usuario desde su primera operación (tope `HISTORY_MAX_DAYS`)
   * hasta ayer, valorando cada día la cantidad y el coste que había ese día (sin inventar
   * historia). La lógica pura vive en `@sextante/core/portfolio/history-reconstruction`, que documenta también
   * los splits y sus límites. Solo escribe lo que cambió (nada, en la pasada nocturna normal),
   * así que se lanza siempre: alta, importación, lote editado, arranque y cron.
   *
   * "Estimado" = anterior a `trackingSince` (fecha UTC del `created_at` más antiguo de sus
   * posiciones); cada fila lleva `estimated = (date < trackingSince)`. Desde esa fecha la serie
   * se considera fiable aunque la rehaga la reconstrucción: el usuario ya usaba Sextante y el
   * valor es en lo sustancial lo que habría capturado el cron. Por eso los huecos posteriores
   * que rellena el backfill quedan `estimated = false` (trade-off aceptado: no distinguimos
   * "cron caído" de "captura real"). Frontend y MCP lo señalan.
   *
   * Reparación automática: una fila estimada cuyo `estimated` no cumple la regla cuenta como
   * cambiada y se corrige en la primera pasada; las estimadas que ya no salen de la
   * reconstrucción se retiran. Si esta sale vacía (aún sin precios porque `primeSymbol` sigue
   * trayendo histórico) no se toca nada.
   *
   * Capturas reales obsoletas: una real solo se respeta mientras sea una foto fiel. Si después
   * se registró una operación con fecha <= la de la captura, esa captura mostraría un escalón
   * falso y se sustituye por la reconstrucción (regla en `@sextante/core/portfolio/staleness`).
   * El borrado de un lote no deja marca, así que el llamante pasa `invalidateFrom`. Las reales
   * no obsoletas no se tocan nunca, y si un día obsoleto no sale de la reconstrucción se
   * conserva la real: mejor un dato desfasado que borrar uno que no podemos rehacer.
   *
   * Un ticker o divisa sin cierre/tasa un día deja esa posición sin valorar (`valuedPositions <
   * totalPositions`), como la captura diaria.
   */
  async backfillUser(userId: string, options: { invalidateFrom?: string | null } = {}): Promise<void> {
    // La resolución ticker → símbolo va antes de abrir la transacción: dentro pediría una
    // segunda conexión y con el pool agotado se bloquearía.
    const tickers = (
      await this.db.select({ ticker: positions.ticker }).from(positions).where(eq(positions.userId, userId))
    ).map((p) => p.ticker);
    const tickerToSymbol = await this.prices.resolveCachedTickers([...new Set(tickers)]);

    // Cerrojo consultivo por usuario: dos reconstrucciones concurrentes leerían lotes distintos y
    // la última en escribir podría dejar el estado antiguo. Se libera al terminar la
    // transacción; los lotes se leen dentro para ver lo último confirmado.
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

      const owned = await tx.select().from(positions).where(eq(positions.userId, userId));
      if (owned.length === 0) return;

      const lotRows = await tx
        .select()
        .from(positionLots)
        .where(eq(positionLots.userId, userId))
        // Orden canónico de `compareLots`: el desempate del mismo día importa.
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
        // Sin lotes (anterior al modelo de lotes): una única compra el día de alta.
        lots: lotsByPosition.get(p.id) ?? [
          {
            kind: 'buy',
            quantity: Number(p.quantity),
            price: Number(p.avgPrice),
            tradedAt: isoDate(p.createdAt),
          },
        ],
      }));

      // Inicio del seguimiento en Sextante, no de las operaciones.
      const trackingSince = isoDate(new Date(Math.min(...owned.map((p) => p.createdAt.getTime()))));

      const earliest = firstTradeDate(historyPositions);
      if (earliest === null) return;
      const floor = isoDate(new Date(Date.now() - HISTORY_MAX_DAYS * DAY_MS));
      const from = earliest > floor ? earliest : floor;
      const to = isoDate(new Date(Date.now() - DAY_MS)); // ayer: hoy es del cron
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
        if (invested === null || marketValue === null) return []; // desbordado: se salta ese día
        return [
          {
            userId,
            date,
            invested,
            marketValue,
            valuedPositions: aggregate.valued,
            totalPositions: aggregate.total,
            fxRates: rates,
            estimated: date < trackingSince,
          },
        ];
      });
      if (rows.length === 0) return;

      // Solo se escribe la diferencia con lo guardado (reescribir ~1.800 filas idénticas por
      // usuario cada noche no aporta nada). `readAt` es previo a la lectura: una real reescrita
      // por la captura nocturna después de leerla es fresca y no debe pisarse (ver `setWhere`).
      const readAt = new Date();
      const existing = await tx.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
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
      const existingByDate = new Map(existing.map((row) => [row.date, row]));
      const newDates = new Set(rows.map((row) => row.date));

      const changed = rows.filter((row) => {
        const current = existingByDate.get(row.date);
        if (!current) return true;
        if (!current.estimated) return staleReal.has(row.date); // real: solo si está obsoleta
        // Un `estimated` incoherente con la regla también cuenta como cambio.
        return !(
          current.estimated === row.estimated &&
          current.invested === row.invested &&
          current.marketValue === row.marketValue &&
          current.valuedPositions === row.valuedPositions &&
          current.totalPositions === row.totalPositions &&
          sameRates(current.fxRates, row.fxRates)
        );
      });
      // Estimadas que ya no salen de la reconstrucción (operación borrada...): se retiran.
      const stale = existing.filter((row) => row.estimated && !newDates.has(row.date)).map((row) => row.date);

      for (let i = 0; i < changed.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = changed.slice(i, i + UPSERT_CHUNK_SIZE);
        const staleInChunk = chunk.filter((row) => staleReal.has(row.date)).map((row) => row.date);
        // Una real solo se pisa si es obsoleta y no ha cambiado desde la lectura (carrera con la
        // captura nocturna).
        const overwritable: SQL | undefined =
          staleInChunk.length > 0
            ? and(
                eq(portfolioSnapshots.estimated, false),
                inArray(portfolioSnapshots.date, staleInChunk),
                lte(portfolioSnapshots.updatedAt, readAt),
              )
            : undefined;
        await tx
          .insert(portfolioSnapshots)
          .values(chunk)
          .onConflictDoUpdate({
            target: [portfolioSnapshots.userId, portfolioSnapshots.date],
            set: {
              invested: sql`excluded.invested`,
              marketValue: sql`excluded.market_value`,
              valuedPositions: sql`excluded.valued_positions`,
              totalPositions: sql`excluded.total_positions`,
              fxRates: sql`excluded.fx_rates`,
              estimated: sql`excluded.estimated`,
              updatedAt: new Date(),
            },
            setWhere: overwritable
              ? or(eq(portfolioSnapshots.estimated, true), overwritable)
              : eq(portfolioSnapshots.estimated, true),
          });
      }
      for (let i = 0; i < stale.length; i += UPSERT_CHUNK_SIZE) {
        await tx
          .delete(portfolioSnapshots)
          .where(
            and(
              eq(portfolioSnapshots.userId, userId),
              eq(portfolioSnapshots.estimated, true),
              inArray(portfolioSnapshots.date, stale.slice(i, i + UPSERT_CHUNK_SIZE)),
            ),
          );
      }
    });
  }

  /** Backfill de todos los usuarios con posiciones, aislado por usuario. */
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
        this.logger.warn(`Backfill de cartera fallido (usuario ${userId}): ${(error as Error).message}`);
      }
    }
    this.logger.log(
      `Backfill de histórico: ${backfilled}/${userIds.length} usuarios` + (failed ? ` — ${failed} con error` : ''),
    );
  }

  /** Reconstruye el histórico tras un alta (ver `position-events.ts`). Nunca debe romper el flujo que disparó el evento. */
  @OnEvent(POSITION_CREATED_EVENT)
  async onPositionCreated({ userId }: PositionCreatedEvent): Promise<void> {
    try {
      await this.backfillUser(userId);
    } catch (error) {
      this.logger.warn(`Backfill tras alta de posición fallido (usuario ${userId}): ${(error as Error).message}`);
    }
  }

  /** Un lote cambió: pide el histórico de precios que falte y reconstruye la evolución. Tolerante a fallos. */
  @OnEvent(LOT_CHANGED_EVENT)
  async onLotChanged({ userId, positionId, invalidateFrom }: LotChangedEvent): Promise<void> {
    // Coalesce por usuario: una ráfaga de ediciones dispararía una reconstrucción por evento,
    // cada una con una conexión esperando el cerrojo, y más de ~10 agotarían el pool. Si ya hay
    // una en curso solo se anota la posición; al terminar repite una vez cubriendo las anotadas.
    const earliest = (a: string | null, b: string | undefined): string | null =>
      b !== undefined && (a === null || b < a) ? b : a;
    const running = this.rebuilding.get(userId);
    if (running) {
      running.positions.add(positionId);
      running.invalidateFrom = earliest(running.invalidateFrom, invalidateFrom);
      return;
    }
    const pending = { positions: new Set([positionId]), invalidateFrom: earliest(null, invalidateFrom) };
    this.rebuilding.set(userId, pending);
    try {
      while (pending.positions.size > 0) {
        const batch = [...pending.positions];
        const from = pending.invalidateFrom;
        pending.positions.clear();
        pending.invalidateFrom = null;
        try {
          for (const id of batch) await this.ensureLotHistory(id);
          await this.backfillUser(userId, { invalidateFrom: from });
        } catch (error) {
          this.logger.warn(
            `Reconstrucción tras cambiar un lote fallida (usuario ${userId}): ${(error as Error).message}`,
          );
        }
      }
    } finally {
      this.rebuilding.delete(userId);
    }
  }

  private async ensureLotHistory(positionId: string): Promise<void> {
    const [position] = await this.db.select().from(positions).where(eq(positions.id, positionId));
    const [first] = await this.db
      .select({ firstTrade: min(positionLots.tradedAt) })
      .from(positionLots)
      .where(eq(positionLots.positionId, positionId));
    if (position && first?.firstTrade) {
      await this.prices.ensureHistoryForTicker(position.ticker, first.firstTrade);
    }
  }

  /**
   * Serie de los últimos `days` días, de la más antigua a la más reciente, reexpresada a
   * `display` con las tasas que guardó cada snapshot (no las de hoy): la gráfica refleja lo
   * que valía la cartera aquel día en esa divisa.
   */
  async history(
    userId: string,
    days: number = HISTORY_DEFAULT_DAYS,
    display: string = SNAPSHOT_BASE_CURRENCY,
  ): Promise<PortfolioHistoryDto> {
    const span = Math.min(Math.max(Math.trunc(days), 1), HISTORY_MAX_DAYS);
    const from = isoDate(new Date(Date.now() - span * 24 * 60 * 60 * 1000));

    const rows = await this.db
      .select()
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.date, from)))
      .orderBy(asc(portfolioSnapshots.date));

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

  /** Usuarios con al menos una posición. */
  private async usersWithPositions(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ userId: positions.userId }).from(positions);
    return rows.map((row) => row.userId);
  }
}
