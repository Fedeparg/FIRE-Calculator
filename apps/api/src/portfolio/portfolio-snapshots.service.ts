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
} from '@sextante/core/portfolio-history';
import { staleSnapshotDates } from '@sextante/core/snapshot-staleness';

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

/** Igualdad de tasas FX (un `jsonb` no conserva el orden de las claves). */
function sameRates(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

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
  /**
   * Usuarios con una reconstrucción por lote en curso → posiciones anotadas para repetirla y la
   * fecha más antigua de lote borrado/movido anotada (ver `onLotChanged`).
   */
  private readonly rebuilding = new Map<string, { positions: Set<string>; invalidateFrom: string | null }>();

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
   * Coste acotado: unas pocas lecturas (posiciones, lotes, series de precios/FX y splits, y las
   * filas ya guardadas) y SOLO las escrituras de lo que cambió (nada, en el caso normal de la
   * pasada nocturna). Por eso se puede lanzar siempre (alta, importación, lote editado, arranque
   * y cron nocturno) sin preocuparse por la factura. Los splits corrigen la cantidad cruda de los
   * lotes (ver `@sextante/core/portfolio-history`, que también documenta las limitaciones).
   *
   * Las filas se guardan con `estimated: true`: son una reconstrucción con los cierres de la
   * caché, no una captura de ese día (p. ej. el instrumento pudo cotizar a otra hora). El
   * frontend lo señala. Una captura REAL (`estimated: false`) solo se pisa si ha quedado
   * obsoleta (ver más abajo; el upsert solo actualiza filas estimadas o esas reales), y las estimadas que ya no salen de la reconstrucción se retiran
   * (incluidas las que un backfill antiguo, con la cantidad de hoy, escribió antes de la compra).
   * Si la reconstrucción sale vacía (aún sin precios porque `primeSymbol` sigue trayendo
   * histórico en segundo plano) no se toca nada: una pasada posterior la completa.
   *
   * CAPTURAS REALES OBSOLETAS: una captura real solo se respeta mientras sea una foto fiel. Si
   * después se registró (importó, editó) una operación con fecha anterior o igual a la de la
   * captura, esa captura no la incluye y mostraría un escalón falso; entonces se sustituye por
   * la reconstrucción de ese día y pasa a `estimated: true` (regla en
   * `@sextante/core/snapshot-staleness`: lote con `tradedAt <= fecha` cambiado DESPUÉS de que se
   * escribiera la captura). El borrado de un lote no deja marca, así que el llamante pasa
   * `invalidateFrom` (su fecha). Las reales no obsoletas no se tocan nunca. Si un día obsoleto no
   * sale de la reconstrucción (sin precio, o sin posiciones ya) se conserva la real: preferimos
   * un dato desfasado a borrar uno que no podemos rehacer. Esto también REPARA los datos ya
   * guardados: la primera pasada tras desplegar (arranque o nocturna) lo detecta sola.
   *
   * Un ticker o divisa sin cierre/tasa un día deja esa posición sin valorar ese día
   * (`valuedPositions < totalPositions`), igual que la captura diaria.
   */
  async backfillUser(
    userId: string,
    options: { invalidateFrom?: string | null } = {},
  ): Promise<void> {
    // La resolución ticker → símbolo (otra lectura) se hace ANTES de abrir la transacción: dentro,
    // pediría una segunda conexión mientras esta mantiene una, y con el pool agotado se bloquearía.
    const tickers = (await this.db.select({ ticker: positions.ticker }).from(positions).where(eq(positions.userId, userId))).map((p) => p.ticker);
    const tickerToSymbol = await this.prices.resolveCachedTickers([...new Set(tickers)]);

    // Todo bajo un cerrojo consultivo por usuario: dos reconstrucciones concurrentes del mismo
    // usuario (alta + importación, o el arranque + un alta) leerían lotes distintos y la última
    // en escribir podría dejar la serie con el estado antiguo. El cerrojo se libera solo al
    // terminar la transacción; los lotes se leen DENTRO para ver lo último confirmado.
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

      const owned = await tx.select().from(positions).where(eq(positions.userId, userId));
      if (owned.length === 0) return; // mismo criterio que `usersWithPositions`

      const lotRows = await tx
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
            quantity: Number(p.quantity),
            price: Number(p.avgPrice),
            tradedAt: p.createdAt.toISOString().slice(0, 10),
          },
        ],
      }));

      const earliest = firstTradeDate(historyPositions);
      if (earliest === null) return;
      const floor = new Date(Date.now() - HISTORY_MAX_DAYS * DAY_MS).toISOString().slice(0, 10);
      const from = earliest > floor ? earliest : floor;
      const to = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10); // ayer: hoy es del cron
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
            estimated: true,
          },
        ];
      });
      if (rows.length === 0) return;

      // Solo se escribe la DIFERENCIA con lo guardado: reconstruir cada noche 5 años de filas
      // idénticas sería escribir ~1.800 filas por usuario sin cambiar nada.
      // Instante previo a la lectura: una real reescrita por la captura nocturna DESPUÉS de leerla
      // es fresca y no debe pisarse (ver `setWhere`).
      const readAt = new Date();
      const existing = await tx
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, userId));
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
        return !(
          current.invested === row.invested &&
          current.marketValue === row.marketValue &&
          current.valuedPositions === row.valuedPositions &&
          current.totalPositions === row.totalPositions &&
          sameRates(current.fxRates, row.fxRates)
        );
      });
      // Estimadas que ya no salen de la reconstrucción (p. ej. de un backfill antiguo anterior a
      // la primera compra, o de una operación borrada): se retiran.
      const stale = existing.filter((row) => row.estimated && !newDates.has(row.date)).map((row) => row.date);

      for (let i = 0; i < changed.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = changed.slice(i, i + UPSERT_CHUNK_SIZE);
        // Reales obsoletas de este bloque (las únicas reales que se pueden sustituir).
        const staleInChunk = chunk.filter((row) => staleReal.has(row.date)).map((row) => row.date);
        // Una real nunca se pisa salvo que la regla la marque obsoleta Y no haya cambiado desde
        // la lectura (carrera con la captura nocturna).
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
              // Una real obsoleta sustituida ya no es una foto fiel: pasa a estimada.
              estimated: true,
              updatedAt: new Date(),
            },
            // Una captura real (estimated = false) no se pisa, ni siquiera ante una carrera con
            // la captura nocturna entre la lectura y la escritura, salvo que sea obsoleta.
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
   * Un lote de una posición existente se añadió, editó o borró: si tiene una fecha anterior a lo
   * que hay cacheado, pide el histórico que falta (el guard de `ensureHistory` no hace nada si ya
   * llega) y reconstruye la evolución. Tolerante a fallos, como `onPositionCreated`.
   */
  @OnEvent(LOT_CHANGED_EVENT)
  async onLotChanged({ userId, positionId, invalidateFrom }: LotChangedEvent): Promise<void> {
    // COALESCE por usuario: una ráfaga de ediciones (importar a mano, corregir fechas) dispararía
    // una reconstrucción por evento, cada una con su conexión esperando el cerrojo del usuario, y
    // más de ~10 agotarían el pool. Si ya hay una en curso, solo se anota la posición: la pasada
    // en curso hace UNA repetición al terminar que cubre todas las anotadas.
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

  /** Pide el histórico de precios que falte para la operación más antigua de una posición. */
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
