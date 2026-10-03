import { Inject, Injectable } from '@nestjs/common';
import { and, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  MAX_CARRY_FORWARD_DAYS,
  type FxPoint,
  type PricePoint,
  type SplitPoint,
} from '@sextante/core/portfolio/history-reconstruction';

import { addDays } from '../common/dates.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { instrumentPrices, instrumentSplits } from '../db/schema.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';
import { FX_CURRENCY_BY_SYMBOL, FX_QUOTE } from './fx-symbols.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';

/** Precio de un instrumento tal y como lo consume el frontend (lectura desde nuestra DB). */
export interface PriceInfo {
  symbol: string;
  close: number;
  currency: string;
  date: string;
  /** Instante (ISO) de la lectura: el refresco intradía reescribe la fila del día. */
  fetchedAt: string;
  /** Cierre anterior a `date` (`null` si es el primer dato), para la variación del día. */
  previousClose: number | null;
}

/**
 * Tasas de cambio para el total agregado de la cartera. `rates[CCY]` = USD por unidad de
 * esa divisa (USD = 1), de modo que convertir A→B es `importe * rates[A] / rates[B]`.
 */
export interface FxRates {
  rates: Record<string, number>;
  /** Fecha (YYYY-MM-DD) del dato más reciente entre las tasas, o null si no hay ninguna. */
  asOf: string | null;
}

/**
 * LECTURAS de la caché de precios (`instrument_prices`, `instrument_splits`): último cierre, tasas
 * FX y series para reconstruir el histórico. Nunca llama a la fuente externa ni resuelve símbolos
 * nuevos (solo la caché del resolutor): es la ruta caliente de la valoración, los snapshots y las
 * alertas. Lo que trae datos de fuera vive en `PriceHistoryService`.
 */
@Injectable()
export class PriceReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
  ) {}

  /** Último precio cacheado de cada ticker pedido, indexado por el ticker original. */
  async getPrices(tickers: string[]): Promise<Map<string, PriceInfo>> {
    const tickerToSymbol = await this.resolveCachedTickers(tickers);
    const latest = await this.latestBySymbol([...new Set(tickerToSymbol.values())]);

    const out = new Map<string, PriceInfo>();
    for (const [ticker, symbol] of tickerToSymbol) {
      const price = latest.get(symbol);
      if (price) out.set(ticker, price);
    }
    return out;
  }

  /** Tasas FX cacheadas (USD por unidad, USD = 1); una divisa sin tasa no aparece y el frontend excluye esas posiciones. */
  async getFxRates(): Promise<FxRates> {
    const rates: Record<string, number> = { [FX_QUOTE]: 1 };
    let asOf: string | null = null;

    const latest = await this.latestBySymbol([...FX_CURRENCY_BY_SYMBOL.keys()]);
    for (const [symbol, price] of latest) {
      const currency = FX_CURRENCY_BY_SYMBOL.get(symbol);
      if (currency && Number.isFinite(price.close) && price.close > 0) {
        rates[currency] = price.close;
        if (asOf === null || price.date > asOf) asOf = price.date;
      }
    }
    return { rates, asOf };
  }

  /** Ticker → símbolo resuelto, solo de caché (nunca dispara OpenFIGI ni la fuente externa), en una consulta. */
  async resolveCachedTickers(tickers: string[]): Promise<Map<string, string>> {
    const resolved = await this.resolver.resolveManyCached(tickers);
    const out = new Map<string, string>();
    for (const [ticker, symbol] of resolved) {
      if (symbol) out.set(ticker, symbol);
    }
    return out;
  }

  /**
   * Series de cierres, FX y splits desde `from` para `backfillUser`. `tickerToSymbol` llega ya
   * resuelto para no pedir otra conexión dentro de una transacción. Se leen
   * `MAX_CARRY_FORWARD_DAYS` días de más para que el primer día arrastre el cierre anterior.
   */
  async getSeriesSince(
    tickerToSymbol: ReadonlyMap<string, string>,
    from: string,
    executor: DatabaseOrTransaction = this.db,
  ): Promise<{
    prices: Record<string, PricePoint[]>;
    fx: Record<string, FxPoint[]>;
    splits: Record<string, SplitPoint[]>;
  }> {
    const symbols = [...new Set([...tickerToSymbol.values(), ...FX_CURRENCY_BY_SYMBOL.keys()])];

    const start = addDays(from, -MAX_CARRY_FORWARD_DAYS);
    const rows =
      symbols.length === 0
        ? []
        : await executor
            .select()
            .from(instrumentPrices)
            .where(and(inArray(instrumentPrices.symbol, symbols), gte(instrumentPrices.date, start)))
            .orderBy(instrumentPrices.symbol, instrumentPrices.date);

    const bySymbol = new Map<string, PricePoint[]>();
    for (const row of rows) {
      const close = Number(row.close);
      if (!Number.isFinite(close) || close <= 0) continue;
      const list = bySymbol.get(row.symbol) ?? [];
      list.push({ date: row.date, close, currency: row.currency });
      bySymbol.set(row.symbol, list);
    }

    const prices: Record<string, PricePoint[]> = {};
    for (const [ticker, symbol] of tickerToSymbol) {
      const series = bySymbol.get(symbol);
      if (series) prices[ticker] = series;
    }
    const fx: Record<string, FxPoint[]> = {};
    for (const [symbol, currency] of FX_CURRENCY_BY_SYMBOL) {
      const series = bySymbol.get(symbol);
      if (series) fx[currency] = series.map(({ date, close }) => ({ date, rate: close }));
    }

    // Los splits se leen enteros, no desde `from`: un lote anterior a la ventana puede ser
    // anterior a un split de dentro. Son pocas filas por símbolo.
    const splitRows =
      tickerToSymbol.size === 0
        ? []
        : await executor
            .select()
            .from(instrumentSplits)
            .where(inArray(instrumentSplits.symbol, [...new Set(tickerToSymbol.values())]))
            .orderBy(instrumentSplits.symbol, instrumentSplits.date);
    const splitsBySymbol = new Map<string, SplitPoint[]>();
    for (const row of splitRows) {
      const list = splitsBySymbol.get(row.symbol) ?? [];
      list.push({ date: row.date, ratio: Number(row.ratio) });
      splitsBySymbol.set(row.symbol, list);
    }
    const splits: Record<string, SplitPoint[]> = {};
    for (const [ticker, symbol] of tickerToSymbol) {
      const list = splitsBySymbol.get(symbol);
      if (list) splits[ticker] = list;
    }
    return { prices, fx, splits };
  }

  /**
   * Último cierre conocido por símbolo (y el anterior, para `previousClose`). Es la ruta caliente
   * (precios, FX, valoración, snapshots, alertas): `ROW_NUMBER()` por símbolo deja que Postgres
   * lea solo las DOS filas más recientes de cada uno por la PK `(symbol, date)`, en vez de traer
   * años de histórico para quedarse con dos.
   */
  private async latestBySymbol(symbols: string[]): Promise<Map<string, PriceInfo>> {
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const ranked = this.db
      .select({
        symbol: instrumentPrices.symbol,
        close: instrumentPrices.close,
        currency: instrumentPrices.currency,
        date: instrumentPrices.date,
        fetchedAt: instrumentPrices.fetchedAt,
        rank: sql<number>`row_number() over (partition by ${instrumentPrices.symbol} order by ${instrumentPrices.date} desc)`.as(
          'rank',
        ),
      })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rank, 2)).orderBy(ranked.symbol, ranked.rank);

    // Por símbolo y de más reciente a más antigua: la primera fila es el precio vigente y la
    // segunda (si la hay), el cierre anterior. La PK impide dos filas con la misma fecha.
    for (const row of rows) {
      const current = out.get(row.symbol);
      if (!current) {
        out.set(row.symbol, {
          symbol: row.symbol,
          close: Number(row.close),
          currency: row.currency,
          date: row.date,
          fetchedAt: row.fetchedAt.toISOString(),
          previousClose: null,
        });
      } else {
        current.previousClose = Number(row.close);
      }
    }
    return out;
  }
}
