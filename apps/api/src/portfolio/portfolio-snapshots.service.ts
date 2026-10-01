import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, asc, eq, gte } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots, positionLots, positions } from '../db/schema.js';
import { POSITION_CREATED_EVENT, type PositionCreatedEvent } from '../positions/position-events.js';
import { PositionsService } from '../positions/positions.service.js';
import { HISTORY_MAX_DAYS, PricesService } from '../prices/prices.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import { convertCurrency } from '@sextante/core/fx';
import {
  firstTradeDate,
  reconstructHistory,
  type HistoryLot,
  type HistoryPosition,
} from '@sextante/core/portfolio-history';

/**
 * DIVISA BASE CANÓNICA del histórico. Los importes de `portfolio_snapshots` se guardan
 * SIEMPRE en euros: Sextante está enfocado al inversor español, así que el euro es la unidad
 * natural de la serie y evita que el histórico dependa de la divisa que el usuario tuviese
 * seleccionada el día de la captura. Para verlo en otra divisa NO se recalcula nada: se
 * reexpresa con las tasas FX que cada snapshot guardó de SU día (ver `history`).
 */
export const SNAPSHOT_BASE_CURRENCY = 'EUR';

/** Rango por defecto del histórico que se puede pedir, en días. El máximo (5 años) vive en `prices.service.ts`. */
export const HISTORY_DEFAULT_DAYS = 365;
export { HISTORY_MAX_DAYS };

/** Filas por sentencia al escribir el histórico reconstruido (evita una sentencia por día). */
const UPSERT_CHUNK_SIZE = 200;

/** Un punto de la serie, ya reexpresado a la divisa pedida. */
export interface PortfolioHistoryPoint {
  date: string;
  /** Coste, en la divisa `display`; `null` si ese día no había tasa para convertirlo. */
  invested: number | null;
  /** Valor de mercado, en la divisa `display`; `null` si no era convertible. */
  marketValue: number | null;
  /** Ganancia/pérdida (valor − coste), en `display`; `null` si alguno no era convertible. */
  pnlAbs: number | null;
  /** Rentabilidad en %; `null` si el coste era 0 o el punto no es convertible. */
  pnlPct: number | null;
  valuedPositions: number;
  totalPositions: number;
  /**
   * `true` si este punto es una RECONSTRUCCIÓN a partir de las operaciones (cantidad y coste
   * de aquel día según los lotes, valorados con los cierres de ese día), no una captura real del
   * cron de aquella fecha. Ver `backfillUser`.
   */
  estimated: boolean;
}

/** Serie histórica de la cartera de un usuario. */
export interface PortfolioHistory {
  /** Divisa en la que se devuelven los importes. */
  display: string;
  /** Divisa en la que están ALMACENADOS (siempre EUR); útil para depurar y para la UI. */
  base: string;
  points: PortfolioHistoryPoint[];
}

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

/** Fecha de hoy en UTC (`YYYY-MM-DD`), la misma referencia que `instrument_prices.date`. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formatea un importe para una columna `numeric(20,8)`. Devuelve `null` si no es finito o no
 * cabe: preferimos NO guardar el snapshot de ese usuario a escribir un número inventado o a
 * reventar con un error del driver.
 */
function toNumeric(value: number): string | null {
  if (!Number.isFinite(value) || Math.abs(value) >= MAX_SNAPSHOT_AMOUNT) return null;
  return value.toFixed(8);
}

/**
 * Histórico de valoración de la cartera: una fila por usuario y día. Es lo que convierte el
 * portfolio de FOTO en PELÍCULA (gráfica de evolución, rentabilidad por periodo).
 *
 * No duplica la fórmula de valoración: llama a `PortfolioValuationService`, exactamente el
 * mismo cálculo que ven la UI y las tools MCP, de modo que el punto de hoy en la gráfica
 * coincide siempre con el total que muestra la cartera.
 */
@Injectable()
export class PortfolioSnapshotsService {
  private readonly logger = new Logger(PortfolioSnapshotsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly valuation: PortfolioValuationService,
    private readonly prices: PricesService,
    private readonly positionsService: PositionsService,
  ) {}

  /**
   * Captura el snapshot de HOY para todos los usuarios con posiciones. Lo ejecuta el job
   * diario, después del refresco de precios.
   *
   * Aislamiento de fallos: cada usuario va en su propio `try`, así que uno con datos raros
   * (un precio imposible, una divisa sin tasa) no impide capturar los del resto. Los usuarios
   * SIN posiciones se omiten a propósito: una fila de ceros no aporta nada a la gráfica y
   * ensuciaría la serie de quien aún no ha empezado.
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
        this.logger.warn(
          `Snapshot de cartera fallido (usuario ${userId}): ${(error as Error).message}`,
        );
      }
    }

    const summary: SnapshotSummary = { date, users: userIds.length, captured, failed };
    this.logger.log(
      `Snapshots de cartera ${date}: ${captured}/${userIds.length} capturados` +
        (failed ? ` — ${failed} con error` : ''),
    );
    return summary;
  }

  /**
   * Captura (o actualiza) el snapshot de un usuario para una fecha. IDEMPOTENTE: la clave
   * primaria es `(userId, date)` y se hace upsert, así que correr el job dos veces el mismo
   * día ACTUALIZA la fila con la última valoración, no la duplica.
   */
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
      // Captura REAL del cron: nunca es una estimación, y sustituye sin condiciones
      // cualquier fila `estimated: true` que un backfill hubiera escrito para este día.
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
   * Reconstruye el histórico de UN usuario desde su PRIMERA operación (con tope de
   * `HISTORY_MAX_DAYS`) hasta ayer, usando sus lotes: cada día se valora la cantidad y el coste
   * medio que se tenían ESE día, no los actuales, así que no se inventa historia (antes de la
   * primera compra no hay snapshot, y tras vender del todo tampoco). La lógica es pura y vive en
   * `@sextante/core/portfolio-history`; aquí solo se cargan los datos y se escribe el resultado.
   *
   * Coste acotado: 3 lecturas (posiciones, lotes y series de precios/FX de una vez) y
   * ~`días / 200` escrituras, con independencia de cuántos días o símbolos haya. Por eso se puede
   * lanzar siempre (alta, importación, arranque y cron nocturno) sin preocuparse por la factura.
   *
   * Las filas se guardan con `estimated: true`: son una reconstrucción con los cierres de la
   * caché, no una captura de ese día (p. ej. el instrumento pudo cotizar a otra hora). El
   * frontend lo señala. Una captura REAL (`estimated: false`) nunca se pisa (`onConflictDoNothing`
   * sobre `(userId, date)`), y las estimadas anteriores se sustituyen enteras en la misma
   * transacción, lo que además RETIRA las que un backfill antiguo (cantidad de hoy aplicada a
   * días previos a la compra) escribió sin base. Si la reconstrucción sale vacía (aún sin
   * precios porque `primeSymbol` sigue trayendo histórico en segundo plano) no se toca nada: una
   * pasada posterior la completa.
   *
   * Un ticker o divisa sin cierre/tasa un día deja esa posición sin valorar ese día
   * (`valuedPositions < totalPositions`), igual que la captura diaria.
   */
  async backfillUser(userId: string): Promise<void> {
    const owned = await this.positionsService.findAllByUser(userId);
    if (owned.length === 0) return; // mismo criterio que `usersWithPositions`

    const lotRows = await this.db
      .select()
      .from(positionLots)
      .where(eq(positionLots.userId, userId))
      // Orden canónico de la agregación de lotes (ver `compareLots`): el del mismo día importa.
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
      // Una posición sin lotes (anterior al modelo de lotes) se trata como una única compra
      // el día de alta: es lo más cercano a la verdad que se conoce.
      lots: lotsByPosition.get(p.id) ?? [
        {
          kind: 'buy',
          quantity: p.quantity,
          price: p.avgPrice,
          tradedAt: p.createdAt.slice(0, 10),
        },
      ],
    }));

    const earliest = firstTradeDate(historyPositions);
    if (earliest === null) return;
    const floor = new Date(Date.now() - HISTORY_MAX_DAYS * DAY_MS).toISOString().slice(0, 10);
    const from = earliest > floor ? earliest : floor;
    const to = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10); // ayer: hoy es del cron
    if (from > to) return;

    const series = await this.prices.getSeriesSince([...new Set(owned.map((p) => p.ticker))], from);
    const days = reconstructHistory({
      positions: historyPositions,
      prices: series.prices,
      fx: series.fx,
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
          estimated: true,
        },
      ];
    });
    if (rows.length === 0) return;

    await this.db.transaction(async (tx) => {
      await tx
        .delete(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.estimated, true)));
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        await tx
          .insert(portfolioSnapshots)
          .values(rows.slice(i, i + UPSERT_CHUNK_SIZE))
          .onConflictDoNothing();
      }
    });
  }

  /** Backfill de todos los usuarios con posiciones. Aislado por usuario, igual que `captureAll`. */
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
        this.logger.warn(
          `Backfill de cartera fallido (usuario ${userId}): ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Backfill de histórico: ${backfilled}/${userIds.length} usuarios` +
        (failed ? ` — ${failed} con error` : ''),
    );
  }

  /**
   * Reconstruye el histórico del usuario justo tras dar de alta (o editar el símbolo
   * de) una posición — ver `position-events.ts` sobre por qué es un evento y no una llamada
   * directa. Tolerante a fallos: nunca debe romper el flujo que disparó el evento.
   */
  @OnEvent(POSITION_CREATED_EVENT)
  async onPositionCreated({ userId }: PositionCreatedEvent): Promise<void> {
    try {
      await this.backfillUser(userId);
    } catch (error) {
      this.logger.warn(
        `Backfill tras alta de posición fallido (usuario ${userId}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Serie histórica del usuario en los últimos `days` días, de la más antigua a la más
   * reciente y REEXPRESADA a `display`.
   *
   * La reexpresión usa las tasas que guardó CADA snapshot (no las de hoy): así la gráfica en
   * dólares refleja lo que la cartera valía en dólares aquel día, que es lo correcto, y no
   * hay que recalcular el histórico al cambiar de divisa. Se reutiliza `convertCurrency`
   * (la misma función que la valoración) en vez de reimplementar la conversión.
   */
  async history(
    userId: string,
    days: number = HISTORY_DEFAULT_DAYS,
    display: string = SNAPSHOT_BASE_CURRENCY,
  ): Promise<PortfolioHistory> {
    const span = Math.min(Math.max(Math.trunc(days), 1), HISTORY_MAX_DAYS);
    const from = new Date(Date.now() - span * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = await this.db
      .select()
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.date, from)))
      .orderBy(asc(portfolioSnapshots.date));

    const points = rows.map((row): PortfolioHistoryPoint => {
      const invested = convertCurrency(
        Number(row.invested),
        SNAPSHOT_BASE_CURRENCY,
        display,
        row.fxRates,
      );
      const marketValue = convertCurrency(
        Number(row.marketValue),
        SNAPSHOT_BASE_CURRENCY,
        display,
        row.fxRates,
      );
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

  /** Usuarios con al menos una posición: los únicos de los que tiene sentido guardar serie. */
  private async usersWithPositions(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ userId: positions.userId }).from(positions);
    return rows.map((row) => row.userId);
  }
}
