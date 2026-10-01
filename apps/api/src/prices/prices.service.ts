import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, inArray, min, sql } from 'drizzle-orm';
import {
  MAX_CARRY_FORWARD_DAYS,
  type FxPoint,
  type PricePoint,
  type SplitPoint,
} from '@sextante/core/portfolio/history-reconstruction';

import { DRIZZLE, type Database } from '../db/database.module.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';
import { instrumentPrices, instrumentSplitChecks, instrumentSplits, positionLots, positions } from '../db/schema.js';
import { SUPPORTED_CURRENCIES } from '@sextante/core/contracts';
import { PRICE_PROVIDER, type PriceHistory, type PriceProvider, type Quote } from './price-provider.interface.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';
import { isoDate } from '../common/dates.js';

/** Divisa puente de las tasas FX: todo se cotiza contra USD y se pivota por él. */
const FX_QUOTE = 'USD';
/** Tope de espera de `primeSymbol`: protege de un ISIN nuevo con resolución larga para que el POST no agote el proxy. */
const PRIME_MAX_WAIT_MS = 9_000;
/** Filas por sentencia al cachear un histórico. */
const UPSERT_CHUNK_SIZE = 200;
/** Histórico de 5 años: una llamada por símbolo y tope de la reconstrucción de snapshots. */
export const HISTORY_MAX_DAYS = 1825;
/** Margen en días: un fin de semana o festivo retrasa la primera barra sin que falte nada. */
const COVERAGE_TOLERANCE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Antigüedad (días) para reconsultar los splits de un símbolo. */
const SPLITS_REFRESH_DAYS = 7;
/** Tope por pasada de `refreshStaleSplits` (los vencimientos nacen el mismo día). */
const SPLITS_REFRESH_MAX_PER_RUN = 40;
/** `YYYY-MM-DD` (UTC) de hace `days` días. */
function daysAgo(days: number): string {
  return isoDate(new Date(Date.now() - days * MS_PER_DAY));
}
/** Pausa entre históricos seguidos: Yahoo rate-limita por IP (429). */
const HISTORY_REQUEST_DELAY_MS = 500;
/** El timer va `unref` para que, usado como tope en un `Promise.race`, no mantenga vivo el proceso. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
/** Símbolo de Yahoo del par CCY→USD (= USD por unidad de CCY). USD consigo mismo es 1. */
function fxSymbol(currency: string): string {
  return `${currency}${FX_QUOTE}=X`;
}

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

export interface RefreshSummary {
  symbols: number;
  fetched: number;
  missing: string[];
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

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  /** Público para que los tests la pongan a 0. */
  historyRequestDelayMs = HISTORY_REQUEST_DELAY_MS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
  ) {}

  /** Refresca los símbolos en uso desde la fuente externa (cron diario; nunca al navegar). Uno que falle no rompe el resto. */
  async refreshAll(): Promise<RefreshSummary> {
    const tickers = await this.distinctTickers();
    const instrumentSymbols = await this.resolveSymbols(tickers);
    // Los pares FX siempre: el total agregado de la cartera los necesita para convertir.
    const symbols = [...new Set([...instrumentSymbols, ...this.fxSymbols()])];

    if (symbols.length === 0) {
      this.logger.log('Refresco de precios: no hay símbolos que actualizar');
      return { symbols: 0, fetched: 0, missing: [] };
    }

    const quotes = await this.provider.getQuotes(symbols);
    await this.upsertQuotes(quotes);

    const missing = symbols.filter((s) => !quotes.has(s));
    const detail =
      `(${this.provider.name}): ${quotes.size}/${symbols.length} símbolos` +
      (missing.length ? ` — sin datos: ${missing.join(', ')}` : '');

    if (quotes.size === 0) {
      // Cero de cero con símbolos pedidos no es un símbolo malo sino fuente caída, rate-limit
      // o corte de red: se registra como error para no dejar precios rancios en silencio.
      this.logger.error(`Refresco de precios SIN NINGÚN dato ${detail}`);
    } else {
      this.logger.log(`Refresco de precios ${detail}`);
    }
    return { symbols: symbols.length, fetched: quotes.size, missing };
  }

  /** Último cierre conocido por símbolo (y el anterior, para `previousClose`). */
  private async latestBySymbol(symbols: string[]): Promise<Map<string, PriceInfo>> {
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    // Por símbolo y de más reciente a más antigua: la primera fila es el precio vigente y la
    // segunda, el cierre anterior.
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
      } else if (current.previousClose === null && row.date < current.date) {
        current.previousClose = Number(row.close);
      }
    }
    return out;
  }

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
    const currencyBySymbol = new Map<string, string>();
    for (const c of SUPPORTED_CURRENCIES) {
      if (c !== FX_QUOTE) currencyBySymbol.set(fxSymbol(c), c);
    }
    const symbols = [...new Set([...tickerToSymbol.values(), ...currencyBySymbol.keys()])];

    const start = new Date(Date.parse(`${from}T00:00:00Z`) - MAX_CARRY_FORWARD_DAYS * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
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
    for (const [symbol, currency] of currencyBySymbol) {
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

  /** Ticker → símbolo resuelto, solo de caché (nunca dispara OpenFIGI ni la fuente externa). */
  async resolveCachedTickers(tickers: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolveCached(ticker);
      if (symbol) out.set(ticker, symbol);
    }
    return out;
  }

  /** Tasas FX cacheadas (USD por unidad, USD = 1); una divisa sin tasa no aparece y el frontend excluye esas posiciones. */
  async getFxRates(): Promise<FxRates> {
    const currencyBySymbol = new Map<string, string>();
    for (const c of SUPPORTED_CURRENCIES) {
      if (c !== FX_QUOTE) currencyBySymbol.set(fxSymbol(c), c);
    }
    const rates: Record<string, number> = { [FX_QUOTE]: 1 };
    let asOf: string | null = null;

    const latest = await this.latestBySymbol([...currencyBySymbol.keys()]);
    for (const [symbol, price] of latest) {
      const currency = currencyBySymbol.get(symbol);
      if (currency && Number.isFinite(price.close) && price.close > 0) {
        rates[currency] = price.close;
        if (asOf === null || price.date > asOf) asOf = price.date;
      }
    }
    return { rates, asOf };
  }

  /**
   * Resuelve y cachea el precio de un ticker recién dado de alta o editado para que se valore
   * al instante; es la única ruta del usuario que dispara fetch externo a propósito. No
   * propaga errores: el precio llega en el siguiente refresco.
   *
   * Lo espera el alta porque el frontend solo re-pide precios cuando cambia el conjunto de
   * tickers. Si un ISIN nuevo tarda (OpenFIGI), `PRIME_MAX_WAIT_MS` acota la espera y la
   * resolución termina en segundo plano (queda cacheada).
   *
   * @param currency divisa de la posición; si no es USD, refresca también su par FX.
   */
  async primeSymbol(ticker: string, currency?: string): Promise<void> {
    // El trabajo se lanza entero; solo se acota cuánto se espera.
    await Promise.race([this.primeNow(ticker, currency), delay(PRIME_MAX_WAIT_MS)]);
  }

  /**
   * Resolución + histórico de 5 años del instrumento (una importación trae compras antiguas);
   * solo aquí o al faltar cobertura, nunca en el refresco diario. Asegura también las divisas
   * de la posición y EUR (base de los snapshots): sin tasas históricas los días pasados no
   * serían convertibles.
   */
  private async primeNow(ticker: string, currency?: string): Promise<void> {
    try {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) await this.primeHistory(symbol);

      const fxCurrencies = new Set([currency, 'EUR']);
      const fxPairs = [...fxCurrencies].filter((c): c is string => !!c && c !== FX_QUOTE).map(fxSymbol);
      await this.ensureHistory(new Map(fxPairs.map((pair) => [pair, daysAgo(HISTORY_MAX_DAYS)])));
    } catch (error) {
      this.logger.warn(`Prime de "${ticker}" falló (se reintentará en el refresco): ${(error as Error).message}`);
    }
  }

  /**
   * Símbolos cuyo histórico no llega a su fecha requerida (la primera operación, no siempre 5
   * años). Límite conocido: uno que cotiza desde hace menos de lo pedido se vuelve a pedir en
   * cada pasada (una llamada por símbolo, solo arranque y alta).
   */
  private async symbolsNeedingHistory(required: ReadonlyMap<string, string>): Promise<string[]> {
    if (required.size === 0) return [];

    const rows = await this.db
      .select({ symbol: instrumentPrices.symbol, minDate: min(instrumentPrices.date) })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, [...required.keys()]))
      .groupBy(instrumentPrices.symbol);

    const earliest = new Map(rows.map((r) => [r.symbol, r.minDate]));
    return [...required]
      .filter(([symbol, since]) => {
        const minDate = earliest.get(symbol);
        if (!minDate) return true;
        const limit = new Date(Date.parse(`${since}T00:00:00Z`) + COVERAGE_TOLERANCE_DAYS * MS_PER_DAY)
          .toISOString()
          .slice(0, 10);
        return minDate > limit;
      })
      .map(([symbol]) => symbol);
  }

  /** Asegura histórico hasta la fecha de cada símbolo pidiendo solo a los que no lo cubren; `alsoSymbols` se piden además. Uno que falle no bloquea el resto. */
  async ensureHistory(required: ReadonlyMap<string, string>, alsoSymbols: readonly string[] = []): Promise<void> {
    const missing = [...new Set([...(await this.symbolsNeedingHistory(required)), ...alsoSymbols])];
    for (const [i, symbol] of missing.entries()) {
      if (i > 0 && this.historyRequestDelayMs > 0) await delay(this.historyRequestDelayMs);
      try {
        await this.primeHistory(symbol);
      } catch (error) {
        this.logger.warn(`Histórico de "${symbol}" no se pudo completar: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Pasada de arranque: histórico de todos los símbolos en uso desde la primera operación de
   * cualquier usuario (tope 5 años) y de los pares FX desde la más antigua. Barata si ya existe;
   * repara posiciones cuyo `primeSymbol` falló sin esperar al cron.
   */
  async ensureHistoryForActivePositions(): Promise<void> {
    const floor = daysAgo(HISTORY_MAX_DAYS);
    // Left join: una posición sin lotes también entra, con su fecha de alta como primera operación.
    const rows = await this.db
      .select({
        ticker: positions.ticker,
        firstTrade: min(sql<string>`coalesce(${positionLots.tradedAt}, ${positions.createdAt}::date)`),
      })
      .from(positions)
      .leftJoin(positionLots, eq(positions.id, positionLots.positionId))
      .groupBy(positions.ticker);

    const required = new Map<string, string>();
    let earliest: string | null = null;
    for (const { ticker, firstTrade } of rows) {
      const since = firstTrade && firstTrade > floor ? firstTrade : floor;
      if (earliest === null || since < earliest) earliest = since;
      const symbol = await this.resolver.resolve(ticker);
      if (!symbol) continue;
      const current = required.get(symbol);
      if (current === undefined || since < current) required.set(symbol, since);
    }
    for (const pair of this.fxSymbols()) required.set(pair, earliest ?? floor);

    // Los símbolos sin marca de splits (o vencida) se reconsultan aunque la cobertura de
    // fechas baste: es la única forma de cargar sus splits.
    const stale = await this.symbolsWithStaleSplits(
      [...required.keys()].filter((symbol) => !this.fxSymbols().includes(symbol)),
    );
    await this.ensureHistory(required, stale);
  }

  /** Histórico de un ticker hasta `since` (tope 5 años) al añadir un lote anterior a lo cacheado; solo resolución cacheada (un ticker sin resolver lo traerá `primeSymbol`). */
  async ensureHistoryForTicker(ticker: string, since: string): Promise<void> {
    const symbol = await this.resolver.resolveCached(ticker);
    if (!symbol) return;
    const floor = daysAgo(HISTORY_MAX_DAYS);
    const required = new Map([[symbol, since > floor ? since : floor]]);
    // Los pares FX también deben llegar hasta esa fecha para convertir los días antiguos.
    for (const pair of this.fxSymbols()) required.set(pair, since > floor ? since : floor);
    await this.ensureHistory(required);
  }

  /** Cachea el histórico; si la fuente no devuelve serie cae al último cierre para no dejar la posición sin precio. */
  private async primeHistory(symbol: string): Promise<void> {
    const { quotes, splits }: PriceHistory = await this.provider.getHistory(symbol);
    if (quotes.length > 0) {
      await this.upsertQuoteList(quotes);
      await this.upsertSplits(splits);
      await this.markSplitsChecked(symbol);
      this.logger.log(`Histórico de ${symbol}: ${quotes.length} cierres y ${splits.length} splits cacheados`);
      return;
    }
    await this.upsertQuotes(await this.provider.getQuotes([symbol]));
  }

  /** Deja constancia de que los splits del símbolo se consultaron ahora (aunque no tenga ninguno). */
  private async markSplitsChecked(symbol: string): Promise<void> {
    await this.db
      .insert(instrumentSplitChecks)
      .values({ symbol })
      .onConflictDoUpdate({ target: instrumentSplitChecks.symbol, set: { checkedAt: new Date() } });
  }

  /** Símbolos cuyos splits nunca se consultaron o llevan más de `SPLITS_REFRESH_DAYS` sin consultarse. */
  private async symbolsWithStaleSplits(symbols: readonly string[]): Promise<string[]> {
    if (symbols.length === 0) return [];
    const cutoff = new Date(Date.now() - SPLITS_REFRESH_DAYS * MS_PER_DAY);
    const rows = await this.db
      .select()
      .from(instrumentSplitChecks)
      .where(inArray(instrumentSplitChecks.symbol, [...symbols]));
    const checkedAt = new Map(rows.map((r) => [r.symbol, r.checkedAt]));
    // Los nunca consultados primero y después los de marca más antigua.
    const time = (symbol: string): number => checkedAt.get(symbol)?.getTime() ?? 0;
    return symbols.filter((symbol) => time(symbol) < cutoff.getTime()).sort((a, b) => time(a) - time(b));
  }

  /**
   * Reconsulta splits vencidos (los más antiguos primero, con tope para escalonar) desde el cron
   * nocturno. El upsert es `DO UPDATE`: los cierres antiguos se reajustan tras un split.
   */
  async refreshStaleSplits(): Promise<void> {
    const tickerToSymbol = await this.resolveCachedTickers(await this.distinctTickers());
    const stale = await this.symbolsWithStaleSplits([...new Set(tickerToSymbol.values())]);
    await this.ensureHistory(new Map(), stale.slice(0, SPLITS_REFRESH_MAX_PER_RUN));
  }

  /** Upsert de los splits de un símbolo (PK `(symbol, date)`): reprimar no duplica filas. */
  private async upsertSplits(splits: readonly { symbol: string; date: string; ratio: number }[]): Promise<void> {
    if (splits.length === 0) return;
    await this.db
      .insert(instrumentSplits)
      .values(splits.map((s) => ({ symbol: s.symbol, date: s.date, ratio: s.ratio.toString() })))
      .onConflictDoUpdate({
        target: [instrumentSplits.symbol, instrumentSplits.date],
        set: { ratio: sql`excluded.ratio` },
      });
  }

  private upsertQuotes(quotes: Map<string, Quote>): Promise<void> {
    return this.upsertQuoteList([...quotes.values()]);
  }

  /**
   * Upsert por bloques: un histórico de 5 años son ~1.280 filas por símbolo y una sentencia por
   * fila multiplicaría por 200 los viajes a la BD en una ruta síncrona del usuario (el alta).
   */
  private async upsertQuoteList(quotes: readonly Quote[]): Promise<void> {
    const fetchedAt = new Date();
    const rows = quotes.map((quote) => ({
      symbol: quote.symbol,
      date: quote.date,
      close: quote.close.toString(),
      currency: quote.currency,
      source: this.provider.name,
      fetchedAt,
    }));

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      await this.db
        .insert(instrumentPrices)
        .values(chunk)
        .onConflictDoUpdate({
          target: [instrumentPrices.symbol, instrumentPrices.date],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
  }

  /** Cada divisa soportada contra USD (USD no necesita par). */
  private fxSymbols(): string[] {
    return SUPPORTED_CURRENCIES.filter((c) => c !== FX_QUOTE).map(fxSymbol);
  }

  /** `ticker` distintos de todas las posiciones (símbolos en uso, compartidos entre usuarios). */
  private async distinctTickers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ ticker: positions.ticker }).from(positions);
    return rows.map((r) => r.ticker);
  }

  /** Resuelve tickers a símbolos de la fuente, sin duplicados ni nulos. */
  private async resolveSymbols(tickers: string[]): Promise<string[]> {
    const symbols = new Set<string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) symbols.add(symbol);
    }
    return [...symbols];
  }
}
