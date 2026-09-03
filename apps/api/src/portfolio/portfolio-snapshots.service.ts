import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, gte, eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { portfolioSnapshots, positions } from '../db/schema.js';
import { PricesService } from '../prices/prices.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import { convertCurrency } from './valuation.js';

/**
 * DIVISA BASE CANÓNICA del histórico. Los importes de `portfolio_snapshots` se guardan
 * SIEMPRE en euros: Sextante está enfocado al inversor español, así que el euro es la unidad
 * natural de la serie y evita que el histórico dependa de la divisa que el usuario tuviese
 * seleccionada el día de la captura. Para verlo en otra divisa NO se recalcula nada: se
 * reexpresa con las tasas FX que cada snapshot guardó de SU día (ver `history`).
 */
export const SNAPSHOT_BASE_CURRENCY = 'EUR';

/** Rango por defecto y máximo del histórico que se puede pedir, en días. */
export const HISTORY_DEFAULT_DAYS = 365;
export const HISTORY_MAX_DAYS = 1825;

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
          updatedAt: new Date(),
        },
      });
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
