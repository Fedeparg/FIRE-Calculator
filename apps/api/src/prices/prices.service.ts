import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, inArray } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { instrumentPrices, positions } from '../db/schema';
import { SUPPORTED_CURRENCIES } from '../positions/dto/create-position.dto';
import { PRICE_PROVIDER, type PriceProvider, type Quote } from './price-provider.interface';
import { SYMBOL_RESOLVER, type SymbolResolver } from './symbol-resolver';

/** Divisa puente de las tasas FX: todo se cotiza contra USD y se pivota por él. */
const FX_QUOTE = 'USD';
/**
 * Tope de espera del refresco en caliente (`primeSymbol`) antes de devolver el control a la
 * petición. El caso común (símbolo exacto) tarda ~1 s; este límite solo protege del caso raro
 * (ISIN nuevo con resolución larga), evitando que el POST cuelgue / agote el proxy.
 */
const PRIME_MAX_WAIT_MS = 9_000;
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
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
   * Devuelve el último precio conocido (desde nuestra DB) para cada ticker pedido. Resuelve
   * ticker → símbolo y mapea el resultado de vuelta al ticker original, para que el frontend
   * lo case con sus posiciones. Los tickers sin precio en caché simplemente no aparecen.
   */
  async getPrices(tickers: string[]): Promise<Map<string, PriceInfo>> {
    const tickerToSymbol = new Map<string, string>();
    for (const ticker of tickers) {
      // Solo caché: la lectura del usuario NUNCA dispara OpenFIGI ni la fuente externa. Un
      // símbolo aún sin resolver no tiene precio hasta que el refresco lo resuelva y cachee.
      const symbol = await this.resolver.resolveCached(ticker);
      if (symbol) tickerToSymbol.set(ticker, symbol);
    }

    const symbols = [...new Set(tickerToSymbol.values())];
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    // El último por símbolo: primera fila de cada símbolo (orden date DESC).
    const latest = new Map<string, PriceInfo>();
    for (const row of rows) {
      if (!latest.has(row.symbol)) {
        latest.set(row.symbol, {
          symbol: row.symbol,
          close: Number(row.close),
          currency: row.currency,
          date: row.date,
        });
      }
    }

    for (const [ticker, symbol] of tickerToSymbol) {
      const price = latest.get(symbol);
      if (price) out.set(ticker, price);
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
    const currencyBySymbol = new Map<string, string>();
    for (const c of SUPPORTED_CURRENCIES) {
      if (c !== FX_QUOTE) currencyBySymbol.set(fxSymbol(c), c);
    }
    const rates: Record<string, number> = { [FX_QUOTE]: 1 };
    let asOf: string | null = null;

    const symbols = [...currencyBySymbol.keys()];
    if (symbols.length === 0) return { rates, asOf };

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    // Primera fila de cada símbolo = la más reciente (orden date DESC).
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      const currency = currencyBySymbol.get(row.symbol);
      const close = Number(row.close);
      if (currency && Number.isFinite(close) && close > 0) {
        rates[currency] = close;
        if (asOf === null || row.date > asOf) asOf = row.date;
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

  /** Resolución + fetch + upsert de un ticker. Autocontenido y tolerante a fallos. */
  private async primeNow(ticker: string, currency?: string): Promise<void> {
    try {
      const symbol = await this.resolver.resolve(ticker);
      const wanted = new Set<string>();
      if (symbol) wanted.add(symbol);
      if (currency && currency !== FX_QUOTE) wanted.add(fxSymbol(currency));
      if (wanted.size === 0) return;

      const quotes = await this.provider.getQuotes([...wanted]);
      await this.upsertQuotes(quotes);
    } catch (error) {
      this.logger.warn(`Prime de "${ticker}" falló (se reintentará en el refresco): ${
        (error as Error).message
      }`);
    }
  }

  /** Upsert de un lote de cotizaciones en `instrument_prices` (1 fila por símbolo y día). */
  private async upsertQuotes(quotes: Map<string, Quote>): Promise<void> {
    for (const quote of quotes.values()) {
      await this.db
        .insert(instrumentPrices)
        .values({
          symbol: quote.symbol,
          date: quote.date,
          close: quote.close.toString(),
          currency: quote.currency,
          source: this.provider.name,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [instrumentPrices.symbol, instrumentPrices.date],
          set: {
            close: quote.close.toString(),
            currency: quote.currency,
            source: this.provider.name,
            fetchedAt: new Date(),
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
