import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, min, sql } from 'drizzle-orm';

import { addDays, MS_PER_DAY, todayUtc } from '../common/dates.js';
import { errorMessage } from '../common/errors.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import {
  instrumentDividends,
  instrumentPrices,
  instrumentSplitChecks,
  instrumentSplits,
  positionLots,
  positions,
} from '../db/schema.js';
import { FX_QUOTE, FX_SYMBOLS, fxSymbol } from './fx-symbols.js';
import {
  PRICE_PROVIDER,
  type DividendEvent,
  type PriceHistory,
  type PriceProvider,
  type Quote,
} from './price-provider.interface.js';
import { PriceReadService } from './price-read.service.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';

/** Tope de espera de `primeSymbol`: protege de un ISIN nuevo con resolución larga para que el POST no agote el proxy. */
const PRIME_MAX_WAIT_MS = 9_000;
/** Filas por sentencia al cachear un histórico. */
const UPSERT_CHUNK_SIZE = 200;
/** Histórico de 5 años: una llamada por símbolo y tope de la reconstrucción de snapshots. */
export const HISTORY_MAX_DAYS = 1825;
/** Margen en días: un fin de semana o festivo retrasa la primera barra sin que falte nada. */
const COVERAGE_TOLERANCE_DAYS = 7;
/** Antigüedad (días) para reconsultar los splits de un símbolo. */
const SPLITS_REFRESH_DAYS = 7;
/** Tope por pasada de `refreshStaleSplits` (los vencimientos nacen el mismo día). */
const SPLITS_REFRESH_MAX_PER_RUN = 40;
/** Pausa entre históricos seguidos: Yahoo rate-limita por IP (429). */
const HISTORY_REQUEST_DELAY_MS = 500;

/** `YYYY-MM-DD` (UTC) de hace `days` días. */
function daysAgo(days: number): string {
  return addDays(todayUtc(), -days);
}

/** El timer va `unref` para que, usado como tope en un `Promise.race`, no mantenga vivo el proceso. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

export interface RefreshSummary {
  symbols: number;
  fetched: number;
  missing: string[];
}

/**
 * ESCRITURAS de la caché de precios desde la fuente externa: refresco de cotizaciones (cron),
 * histórico al dar de alta un símbolo (`primeSymbol`), guard de cobertura (`ensureHistory*`) y
 * splits y dividendos que llegan con el histórico. Es lo único que habla con el proveedor; las
 * lecturas viven en `PriceReadService`.
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);
  /** Público para que los tests la pongan a 0. */
  historyRequestDelayMs = HISTORY_REQUEST_DELAY_MS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
    private readonly reads: PriceReadService,
  ) {}

  /** Refresca los símbolos en uso desde la fuente externa (cron diario; nunca al navegar). Uno que falle no rompe el resto. */
  async refreshAll(): Promise<RefreshSummary> {
    const tickers = await this.distinctTickers();
    const instrumentSymbols = await this.resolveSymbols(tickers);
    // Los pares FX siempre: el total agregado de la cartera los necesita para convertir.
    const symbols = [...new Set([...instrumentSymbols, ...FX_SYMBOLS])];

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

  /** Asegura histórico hasta la fecha de cada símbolo pidiendo solo a los que no lo cubren; `alsoSymbols` se piden además. Uno que falle no bloquea el resto. */
  async ensureHistory(required: ReadonlyMap<string, string>, alsoSymbols: readonly string[] = []): Promise<void> {
    const missing = [...new Set([...(await this.symbolsNeedingHistory(required)), ...alsoSymbols])];
    for (const [i, symbol] of missing.entries()) {
      if (i > 0 && this.historyRequestDelayMs > 0) await delay(this.historyRequestDelayMs);
      try {
        await this.primeHistory(symbol);
      } catch (error) {
        this.logger.warn(`Histórico de "${symbol}" no se pudo completar: ${errorMessage(error)}`);
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
    for (const pair of FX_SYMBOLS) required.set(pair, earliest ?? floor);

    // Los símbolos sin marca de splits (o vencida) se reconsultan aunque la cobertura de
    // fechas baste: es la única forma de cargar sus splits.
    const stale = await this.symbolsWithStaleSplits(
      [...required.keys()].filter((symbol) => !FX_SYMBOLS.includes(symbol)),
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
    for (const pair of FX_SYMBOLS) required.set(pair, since > floor ? since : floor);
    await this.ensureHistory(required);
  }

  /**
   * Reconsulta splits vencidos (los más antiguos primero, con tope para escalonar) desde el cron
   * nocturno. El upsert es `DO UPDATE`: los cierres antiguos se reajustan tras un split.
   */
  async refreshStaleSplits(): Promise<void> {
    const tickerToSymbol = await this.reads.resolveCachedTickers(await this.distinctTickers());
    const stale = await this.symbolsWithStaleSplits([...new Set(tickerToSymbol.values())]);
    await this.ensureHistory(new Map(), stale.slice(0, SPLITS_REFRESH_MAX_PER_RUN));
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
      this.logger.warn(`Prime de "${ticker}" falló (se reintentará en el refresco): ${errorMessage(error)}`);
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
        const limit = addDays(since, COVERAGE_TOLERANCE_DAYS);
        return minDate > limit;
      })
      .map(([symbol]) => symbol);
  }

  /** Cachea el histórico; si la fuente no devuelve serie cae al último cierre para no dejar la posición sin precio. */
  private async primeHistory(symbol: string): Promise<void> {
    const { quotes, splits, dividends }: PriceHistory = await this.provider.getHistory(symbol);
    if (quotes.length > 0) {
      await this.upsertQuoteList(quotes);
      await this.upsertSplits(splits);
      await this.upsertDividends(dividends);
      await this.markSplitsChecked(symbol);
      this.logger.log(
        `Histórico de ${symbol}: ${quotes.length} cierres, ${splits.length} splits y ${dividends.length} dividendos cacheados`,
      );
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

  /**
   * Upsert de los dividendos por acción de un símbolo (PK `(symbol, ex_date)`). `DO UPDATE`: Yahoo
   * reajusta los importes pasados tras un split, igual que los cierres.
   */
  private async upsertDividends(dividends: readonly DividendEvent[]): Promise<void> {
    if (dividends.length === 0) return;
    await this.db
      .insert(instrumentDividends)
      .values(
        dividends.map((d) => ({
          symbol: d.symbol,
          exDate: d.exDate,
          amount: d.amount.toString(),
          currency: d.currency,
        })),
      )
      .onConflictDoUpdate({
        target: [instrumentDividends.symbol, instrumentDividends.exDate],
        set: { amount: sql`excluded.amount`, currency: sql`excluded.currency` },
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
