import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, inArray, lte, sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { instrumentPrices, positions } from '../db/schema.js';
import { SUPPORTED_CURRENCIES } from '../positions/dto/create-position.dto.js';
import { PRICE_PROVIDER, type PriceProvider, type Quote } from './price-provider.interface.js';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver.js';

/** Divisa puente de las tasas FX: todo se cotiza contra USD y se pivota por él. */
const FX_QUOTE = 'USD';
/**
 * Tope de espera del refresco en caliente (`primeSymbol`) antes de devolver el control a la
 * petición. El caso común (símbolo exacto) tarda ~1 s; este límite solo protege del caso raro
 * (ISIN nuevo con resolución larga), evitando que el POST cuelgue / agote el proxy.
 */
const PRIME_MAX_WAIT_MS = 9_000;
/** Filas por sentencia al cachear un histórico (evita una sentencia por cierre). */
const UPSERT_CHUNK_SIZE = 200;
/**
 * Días de cobertura de histórico que se garantizan para cada símbolo/par FX en uso, y
 * profundidad del backfill de `portfolio_snapshots` (`PortfolioSnapshotsService` importa
 * esta misma constante: single source of truth, un solo número mágico).
 */
export const HISTORY_BACKFILL_DAYS = 7;
/**
 * Espera `ms`. El temporizador va `unref`: solo se usa como TOPE de espera en un
 * `Promise.race`, así que, si el trabajo termina antes, el timer pendiente no debe mantener
 * vivo el proceso (apagado limpio del contenedor, y tests que no se quedan colgados 9 s).
 */
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
  /**
   * Instante (ISO) en que se obtuvo este precio de la fuente. Con el refresco intradía, la
   * fila del día se reescribe varias veces: `date` dice de qué día es y `fetchedAt` cuándo se
   * leyó, que es lo que la cartera enseña como "actualizado hace…".
   */
  fetchedAt: string;
}

/** Resumen de una ejecución del refresco (para logs y el trigger manual de dev). */
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

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(SYMBOL_RESOLVER) private readonly resolver: SymbolResolver,
  ) {}

  /**
   * Refresca el precio de todos los símbolos en uso (distintos `ticker` de TODAS las
   * posiciones), llamando a la fuente externa y guardando en `instrument_prices`. Es lo
   * que ejecuta el cron diario; el usuario nunca dispara esto al navegar. Tolerante a
   * fallos: un símbolo que no resuelva o que la fuente no devuelva no rompe el resto.
   */
  async refreshAll(): Promise<RefreshSummary> {
    const tickers = await this.distinctTickers();
    const instrumentSymbols = await this.resolveSymbols(tickers);
    // Además de los instrumentos en uso, refrescamos SIEMPRE los pares FX (divisas
    // soportadas vs USD): el total agregado de la cartera los necesita para convertir.
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
      // Cero de cero cuando SÍ había símbolos que pedir: no es un símbolo malo, es la fuente
      // caída, un bloqueo por rate-limit o un corte de red. Antes se registraba como un log
      // normal y pasaba desapercibido, dejando la cartera con precios rancios en silencio.
      this.logger.error(`Refresco de precios SIN NINGÚN dato ${detail}`);
    } else {
      this.logger.log(`Refresco de precios ${detail}`);
    }
    return { symbols: symbols.length, fetched: quotes.size, missing };
  }

  /**
   * Última fila por símbolo (orden `date DESC`, primera de cada símbolo). Con `upTo` se
   * acota a "como estaba el precio ESE día" (`date &lt;= upTo`, filtrado en la query, no en
   * memoria); sin él es el comportamiento de siempre: el cierre más reciente conocido.
   * Compartida por `getPrices`/`getFxRates` (sin `upTo`) y sus variantes "as of".
   */
  private async latestBySymbol(symbols: string[], upTo?: string): Promise<Map<string, PriceInfo>> {
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const conditions = [inArray(instrumentPrices.symbol, symbols)];
    if (upTo) conditions.push(lte(instrumentPrices.date, upTo));

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(and(...conditions))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    for (const row of rows) {
      if (!out.has(row.symbol)) {
        out.set(row.symbol, {
          symbol: row.symbol,
          close: Number(row.close),
          currency: row.currency,
          date: row.date,
          fetchedAt: row.fetchedAt.toISOString(),
        });
      }
    }
    return out;
  }

  /**
   * Devuelve el último precio conocido (desde nuestra DB) para cada ticker pedido. Resuelve
   * ticker → símbolo y mapea el resultado de vuelta al ticker original, para que el frontend
   * lo case con sus posiciones. Los tickers sin precio en caché simplemente no aparecen.
   */
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
   * Igual que `getPrices`, pero el precio de cada ticker es el que estaba vigente el `date`
   * pedido (última fila con `date &lt;= date`), no el más reciente. Sirve para reconstruir
   * cómo se habría valorado la cartera un día pasado (`PortfolioSnapshotsService.backfillUser`),
   * sin duplicar la resolución ticker→símbolo ni el criterio de "una fila por símbolo".
   */
  async getPricesAsOf(tickers: string[], date: string): Promise<Map<string, PriceInfo>> {
    const tickerToSymbol = await this.resolveCachedTickers(tickers);
    const latest = await this.latestBySymbol([...new Set(tickerToSymbol.values())], date);

    const out = new Map<string, PriceInfo>();
    for (const [ticker, symbol] of tickerToSymbol) {
      const price = latest.get(symbol);
      if (price) out.set(ticker, price);
    }
    return out;
  }

  /** Ticker → símbolo resuelto, solo de caché (nunca dispara OpenFIGI ni la fuente externa). */
  private async resolveCachedTickers(tickers: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolveCached(ticker);
      if (symbol) out.set(ticker, symbol);
    }
    return out;
  }

  /**
   * Tasas FX (USD por unidad de cada divisa soportada) desde nuestra DB, para que el
   * frontend convierta el total agregado a la divisa que elija el usuario. USD = 1 fijo;
   * una divisa sin tasa en caché simplemente no aparece (el frontend la trata como
   * no convertible y excluye esas posiciones del total, señalándolo).
   */
  async getFxRates(): Promise<FxRates> {
    return this.fxRatesUpTo();
  }

  /** Igual que `getFxRates`, pero con las tasas tal y como estaban el `date` pedido. */
  async getFxRatesAsOf(date: string): Promise<FxRates> {
    return this.fxRatesUpTo(date);
  }

  private async fxRatesUpTo(upTo?: string): Promise<FxRates> {
    const currencyBySymbol = new Map<string, string>();
    for (const c of SUPPORTED_CURRENCIES) {
      if (c !== FX_QUOTE) currencyBySymbol.set(fxSymbol(c), c);
    }
    const rates: Record<string, number> = { [FX_QUOTE]: 1 };
    let asOf: string | null = null;

    const latest = await this.latestBySymbol([...currencyBySymbol.keys()], upTo);
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
   * Resuelve y cachea el precio de UN ticker recién dado de alta o editado, en caliente,
   * para que su valoración aparezca al instante en vez de esperar al cron diario. Es la
   * ÚNICA ruta del usuario que dispara resolución/fetch externos a propósito (una acción de
   * escritura puntual, no la navegación). Tolerante a fallos: si la fuente falla, la posición
   * se crea igualmente y el precio llegará en el próximo refresco (no propaga el error).
   *
   * Lo espera la ruta de escritura (el alta), porque el frontend solo re-pide precios cuando
   * cambia el CONJUNTO de tickers (una vez, tras crear): si no estuviera ya en la DB, la
   * nueva posición saldría sin precio hasta recargar. Para el caso común (símbolo exacto del
   * buscador) es una sola llamada rápida. Pero un ISIN nuevo dispara la resolución completa
   * (OpenFIGI + validar candidatos), que puede tardar; por eso ACOTAMOS la espera con
   * `PRIME_MAX_WAIT_MS`: si se pasa, el POST responde igualmente y la resolución termina en
   * segundo plano (queda cacheada y el precio aparece en la siguiente carga).
   *
   * @param ticker símbolo o ISIN tal y como se guardó en la posición.
   * @param currency divisa de la posición; si no es USD, refresca también su par FX para que
   *   el total agregado pueda convertirla desde ya.
   */
  async primeSymbol(ticker: string, currency?: string): Promise<void> {
    // El trabajo se lanza entero (sigue en segundo plano si vence el timeout); solo acotamos
    // CUÁNTO esperamos antes de devolver el control a la petición.
    await Promise.race([this.primeNow(ticker, currency), delay(PRIME_MAX_WAIT_MS)]);
  }

  /**
   * Resolución + fetch + upsert de un ticker. Autocontenido y tolerante a fallos.
   *
   * Del INSTRUMENTO se trae un AÑO de cierres, no solo el del día: hasta que este cambio
   * existió, `instrument_prices` solo recibía el cierre del día en que corría el cron, así que
   * un símbolo nuevo no tenía serie hasta pasados meses y la gráfica de evolución nacía vacía.
   * Es una única petición extra por símbolo NUEVO (ver `PriceProvider.getHistory`).
   *
   * Del par FX se asegura AL MENOS `HISTORY_BACKFILL_DAYS` días (vía `ensureRecentHistory`,
   * que no vuelve a pedir nada si ya los tiene): antes bastaba el último cierre porque cada
   * snapshot de cartera solo guardaba las tasas de SU día, pero el backfill de
   * `portfolio_snapshots` (`PortfolioSnapshotsService.backfillUser`) necesita reexpresar
   * también los días PASADOS a la divisa de la posición, y para eso hace falta su histórico.
   */
  private async primeNow(ticker: string, currency?: string): Promise<void> {
    try {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) await this.primeHistory(symbol);

      if (currency && currency !== FX_QUOTE) {
        await this.ensureRecentHistory([fxSymbol(currency)], HISTORY_BACKFILL_DAYS);
      }
    } catch (error) {
      this.logger.warn(`Prime de "${ticker}" falló (se reintentará en el refresco): ${
        (error as Error).message
      }`);
    }
  }

  /**
   * Símbolos, de entre los pedidos, cuyo histórico en `instrument_prices` NO cubre los
   * últimos `days` días: sin ninguna fila, o con la fila más antigua posterior al corte. Es
   * un criterio de COBERTURA (fecha mínima), no de conteo de filas: un fin de semana o
   * festivo de mercado da menos filas que días naturales sin que falte nada.
   */
  private async symbolsNeedingHistory(symbols: string[], days: number): Promise<string[]> {
    if (symbols.length === 0) return [];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = await this.db
      .select({ symbol: instrumentPrices.symbol, minDate: sql<string>`min(${instrumentPrices.date})` })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .groupBy(instrumentPrices.symbol);

    const covered = new Map(rows.map((r) => [r.symbol, r.minDate]));
    return symbols.filter((s) => {
      const min = covered.get(s);
      return !min || min > cutoff;
    });
  }

  /**
   * Se asegura de que cada símbolo pedido tenga al menos `days` días de cobertura en
   * `instrument_prices`, pidiendo histórico SOLO a los que les falte (guard barato: una
   * query agrupada, y el fetch real solo para el hueco real). Tolerante por símbolo: uno que
   * falle no bloquea el resto.
   */
  async ensureRecentHistory(symbols: string[], days: number): Promise<void> {
    const missing = await this.symbolsNeedingHistory(symbols, days);
    for (const symbol of missing) {
      try {
        await this.primeHistory(symbol);
      } catch (error) {
        this.logger.warn(
          `Histórico de "${symbol}" no se pudo completar: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Igual que `ensureRecentHistory`, pero para los pares FX de las divisas soportadas. */
  async ensureFxHistory(days: number): Promise<void> {
    await this.ensureRecentHistory(this.fxSymbols(), days);
  }

  /**
   * Pasada de arranque: se asegura de que TODOS los símbolos en uso (de cualquier usuario) y
   * los pares FX tengan cobertura de `days` días. Barata si ya hay histórico (el guard de
   * `ensureRecentHistory` no vuelve a pedir nada), así que es segura de correr en cada
   * arranque del proceso — repara posiciones dadas de alta ANTES de que este backfill
   * existiera, o cuyo `primeSymbol` falló en su momento, sin esperar al cron.
   */
  async ensureRecentHistoryForActivePositions(days: number = HISTORY_BACKFILL_DAYS): Promise<void> {
    const tickers = await this.distinctTickers();
    const instrumentSymbols = await this.resolveSymbols(tickers);
    await this.ensureRecentHistory(instrumentSymbols, days);
    await this.ensureFxHistory(days);
  }

  /**
   * Trae y cachea el histórico de un símbolo recién dado de alta. Si la fuente no devuelve
   * serie (símbolo exótico, respuesta sin `timestamp`), CAE al último cierre: el
   * comportamiento previo al histórico, para no dejar la posición sin precio por intentar
   * conseguir más datos.
   */
  private async primeHistory(symbol: string): Promise<void> {
    const history = await this.provider.getHistory(symbol);
    if (history.length > 0) {
      await this.upsertQuoteList(history);
      this.logger.log(`Histórico de ${symbol}: ${history.length} cierres cacheados`);
      return;
    }
    await this.upsertQuotes(await this.provider.getQuotes([symbol]));
  }

  /** Upsert de un lote de cotizaciones en `instrument_prices` (1 fila por símbolo y día). */
  private upsertQuotes(quotes: Map<string, Quote>): Promise<void> {
    return this.upsertQuoteList([...quotes.values()]);
  }

  /**
   * Upsert de una LISTA de cotizaciones. Se inserta por bloques en vez de fila a fila porque
   * un histórico anual son ~250 filas por símbolo: una sentencia por fila multiplicaría por
   * 250 los viajes a la BD durante un alta, que es una ruta síncrona del usuario.
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

  /** Símbolos FX a refrescar: cada divisa soportada contra USD (USD no necesita par). */
  private fxSymbols(): string[] {
    return SUPPORTED_CURRENCIES.filter((c) => c !== FX_QUOTE).map(fxSymbol);
  }

  /** `ticker` distintos de todas las posiciones (símbolos en uso, compartidos entre usuarios). */
  private async distinctTickers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ ticker: positions.ticker }).from(positions);
    return rows.map((r) => r.ticker);
  }

  /** Resuelve una lista de tickers a símbolos de la fuente, sin duplicados ni nulos. */
  private async resolveSymbols(tickers: string[]): Promise<string[]> {
    const symbols = new Set<string>();
    for (const ticker of tickers) {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) symbols.add(symbol);
    }
    return [...symbols];
  }
}
