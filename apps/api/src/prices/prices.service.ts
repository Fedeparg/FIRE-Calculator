import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, inArray, min, sql } from 'drizzle-orm';
import {
  MAX_CARRY_FORWARD_DAYS,
  type FxPoint,
  type PricePoint,
  type SplitPoint,
} from '@sextante/core/portfolio-history';

import { DRIZZLE, type Database } from '../db/database.module.js';
import type { DatabaseOrTransaction } from '../positions/position-access.js';
import {
  instrumentPrices,
  instrumentSplitChecks,
  instrumentSplits,
  positionLots,
  positions,
} from '../db/schema.js';
import { SUPPORTED_CURRENCIES } from '../positions/dto/create-position.dto.js';
import {
  PRICE_PROVIDER,
  type PriceHistory,
  type PriceProvider,
  type Quote,
} from './price-provider.interface.js';
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
 * Profundidad máxima del histórico: 5 años. Es lo que se pide a la fuente en UNA llamada por
 * símbolo (`range=5y`) y el tope de cuánto atrás se reconstruyen los snapshots de la cartera
 * (`PortfolioSnapshotsService` importa esta misma constante: un solo número mágico).
 */
export const HISTORY_MAX_DAYS = 1825;
/**
 * Margen (días) con que se da por cubierta una fecha: un fin de semana o un festivo hacen que
 * la primera barra de la serie caiga unos días DESPUÉS de la fecha pedida sin que falte nada.
 */
const COVERAGE_TOLERANCE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Antigüedad (días) a partir de la cual se vuelven a consultar los splits de un símbolo. */
const SPLITS_REFRESH_DAYS = 7;
/** `YYYY-MM-DD` (UTC) de hace `days` días. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString().slice(0, 10);
}
/**
 * Pausa entre peticiones de histórico consecutivas (`ensureHistory`): Yahoo rate-limita por IP
 * (429) y una pasada de arranque puede pedir decenas de símbolos seguidos. Igual que
 * `REQUEST_DELAY_MS` del proveedor en el refresco.
 */
const HISTORY_REQUEST_DELAY_MS = 500;
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
  /**
   * Cierre de la sesión anterior a `date` (la fila previa de la serie), o `null` si es el primer
   * dato del símbolo. Con él la cartera calcula la variación del día sin otra consulta.
   */
  previousClose: number | null;
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
  /** Pausa entre peticiones de histórico seguidas; público para que los tests la pongan a 0. */
  historyRequestDelayMs = HISTORY_REQUEST_DELAY_MS;

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
   * Última fila por símbolo (orden `date DESC`, primera de cada símbolo): el cierre más
   * reciente conocido. Compartida por `getPrices` y `getFxRates`.
   */
  private async latestBySymbol(symbols: string[]): Promise<Map<string, PriceInfo>> {
    const out = new Map<string, PriceInfo>();
    if (symbols.length === 0) return out;

    const rows = await this.db
      .select()
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, symbols))
      .orderBy(instrumentPrices.symbol, desc(instrumentPrices.date));

    // Las filas llegan por símbolo y de la más reciente a la más antigua: la primera de cada
    // símbolo es el precio vigente y la segunda, el cierre anterior.
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
   * Series de cierres diarios desde `from` (YYYY-MM-DD), para reconstruir el histórico de la
   * cartera (`PortfolioSnapshotsService.backfillUser`): los instrumentos (ticker → símbolo ya
   * resuelto con `resolveCachedTickers`, para no pedir una conexión más desde dentro de una
   * transacción) y las
   * tasas FX de cada divisa soportada. Son DOS consultas en total, con independencia de cuántos
   * días o símbolos haya: la reconstrucción lee las series una vez y las recorre en memoria, en
   * vez de pedir "el precio de ese día" a la BD día a día (miles de consultas por usuario).
   *
   * Se lee `MAX_CARRY_FORWARD_DAYS` días de MÁS por detrás de `from` para que el primer día de la
   * ventana pueda arrastrar el cierre anterior (fin de semana, festivo). Un ticker sin símbolo
   * resuelto en caché o sin filas, o una divisa sin tasa, simplemente no aparece.
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

    // Los splits se leen enteros, no solo desde `from`: un lote anterior a la ventana puede ser
    // anterior a un split de dentro de ella. Son pocas filas por símbolo.
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
   * Del INSTRUMENTO se traen hasta 5 AÑOS de cierres en una sola llamada (ver
   * `primeHistory`), no solo el del día: así la evolución de la cartera puede reconstruirse desde
   * la primera operación aunque sea antigua (una importación de bróker trae compras de hace años).
   * Es una única petición por símbolo NUEVO, y solo aquí (alta/importación) o cuando falta
   * cobertura (`ensureHistory`), nunca en el refresco diario.
   *
   * De las divisas se asegura la cobertura de la de la posición y la del EUR (la divisa base de los
   * snapshots): sin sus tasas históricas los días pasados no serían convertibles y se omitirían.
   * `ensureHistory` no vuelve a pedir nada si ya están cubiertas.
   */
  private async primeNow(ticker: string, currency?: string): Promise<void> {
    try {
      const symbol = await this.resolver.resolve(ticker);
      if (symbol) await this.primeHistory(symbol);

      const fxCurrencies = new Set([currency, 'EUR']);
      const fxPairs = [...fxCurrencies]
        .filter((c): c is string => !!c && c !== FX_QUOTE)
        .map(fxSymbol);
      await this.ensureHistory(new Map(fxPairs.map((pair) => [pair, daysAgo(HISTORY_MAX_DAYS)])));
    } catch (error) {
      this.logger.warn(`Prime de "${ticker}" falló (se reintentará en el refresco): ${
        (error as Error).message
      }`);
    }
  }

  /**
   * Símbolos cuyo histórico en `instrument_prices` NO llega hasta su fecha requerida: sin
   * ninguna fila, o con la fila más antigua posterior a `since` (más el margen de fin de semana
   * y festivos). Es un criterio de COBERTURA (fecha mínima), no de conteo de filas.
   *
   * Cada símbolo trae SU fecha: lo necesario es hasta la primera operación del usuario, no
   * siempre los 5 años (una cartera de un mes no necesita volver a pedir nada tras el primer
   * histórico). Límite conocido: un instrumento que cotiza desde hace menos de lo pedido (un ETF
   * joven con una compra anterior a su salida, imposible en la práctica salvo error de datos)
   * se vuelve a pedir en cada pasada de `ensureHistory`; está acotado a una llamada por símbolo
   * y esas pasadas son solo el arranque del proceso y el alta, no el cron.
   */
  private async symbolsNeedingHistory(required: ReadonlyMap<string, string>): Promise<string[]> {
    if (required.size === 0) return [];

    const rows = await this.db
      .select({ symbol: instrumentPrices.symbol, minDate: min(instrumentPrices.date) })
      .from(instrumentPrices)
      .where(inArray(instrumentPrices.symbol, [...required.keys()]))
      .groupBy(instrumentPrices.symbol);

    const earliest = new Map(rows.map((r) => [r.symbol, r.minDate]));
    return [...required].filter(([symbol, since]) => {
      const minDate = earliest.get(symbol);
      if (!minDate) return true;
      const limit = new Date(Date.parse(`${since}T00:00:00Z`) + COVERAGE_TOLERANCE_DAYS * MS_PER_DAY)
        .toISOString()
        .slice(0, 10);
      return minDate > limit;
    }).map(([symbol]) => symbol);
  }

  /**
   * Se asegura de que cada símbolo tenga histórico hasta su fecha (`símbolo → YYYY-MM-DD`),
   * pidiéndolo SOLO a los que no lo cubren (guard barato: una query agrupada, y el fetch real
   * solo para el hueco real). `alsoSymbols` se piden además de lo que falte por cobertura (p. ej.
   * los de splits sin consultar). Tolerante por símbolo: uno que falle no bloquea el resto.
   */
  async ensureHistory(
    required: ReadonlyMap<string, string>,
    alsoSymbols: readonly string[] = [],
  ): Promise<void> {
    const missing = [...new Set([...(await this.symbolsNeedingHistory(required)), ...alsoSymbols])];
    for (const [i, symbol] of missing.entries()) {
      if (i > 0 && this.historyRequestDelayMs > 0) await delay(this.historyRequestDelayMs);
      try {
        await this.primeHistory(symbol);
      } catch (error) {
        this.logger.warn(
          `Histórico de "${symbol}" no se pudo completar: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Pasada de arranque: se asegura de que TODOS los símbolos en uso (de cualquier usuario) tengan
   * histórico desde la primera operación que alguien tiene en ellos (con tope de 5 años), y los
   * pares FX desde la operación más antigua de todas. Barata si ya hay histórico (el guard de
   * `ensureHistory` no vuelve a pedir nada), así que es segura de correr en cada arranque —
   * repara posiciones dadas de alta ANTES de que existiera el histórico largo, o cuyo
   * `primeSymbol` falló en su momento, sin esperar al cron.
   */
  async ensureHistoryForActivePositions(): Promise<void> {
    const floor = daysAgo(HISTORY_MAX_DAYS);
    // Left join: una posición sin lotes (anterior al modelo de lotes) también entra, con su fecha
    // de alta como primera operación.
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

    // Los símbolos cacheados antes de existir los splits (o con la marca vencida) se reconsultan
    // aunque su cobertura de fechas sea suficiente: es la única forma de cargar sus splits.
    const stale = await this.symbolsWithStaleSplits(
      [...required.keys()].filter((symbol) => !this.fxSymbols().includes(symbol)),
    );
    await this.ensureHistory(required, stale);
  }

  /**
   * Asegura el histórico de UN ticker hasta `since` (YYYY-MM-DD, con tope de 5 años): lo que hace
   * falta cuando se añade o edita un lote con una fecha anterior a lo que ya hay cacheado. Solo
   * pide a la fuente si la cobertura no llega (mismo guard que `ensureHistory`). Usa solo la
   * resolución cacheada: un ticker aún sin resolver ya lo traerá `primeSymbol`/el arranque.
   */
  async ensureHistoryForTicker(ticker: string, since: string): Promise<void> {
    const symbol = await this.resolver.resolveCached(ticker);
    if (!symbol) return;
    const floor = daysAgo(HISTORY_MAX_DAYS);
    const required = new Map([[symbol, since > floor ? since : floor]]);
    // Los pares FX también deben llegar hasta esa fecha para poder convertir los días antiguos.
    for (const pair of this.fxSymbols()) required.set(pair, since > floor ? since : floor);
    await this.ensureHistory(required);
  }

  /**
   * Trae y cachea el histórico de un símbolo recién dado de alta. Si la fuente no devuelve
   * serie (símbolo exótico, respuesta sin `timestamp`), CAE al último cierre: el
   * comportamiento previo al histórico, para no dejar la posición sin precio por intentar
   * conseguir más datos.
   */
  private async primeHistory(symbol: string): Promise<void> {
    const { quotes, splits }: PriceHistory = await this.provider.getHistory(symbol);
    if (quotes.length > 0) {
      await this.upsertQuoteList(quotes);
      await this.upsertSplits(splits);
      await this.markSplitsChecked(symbol);
      this.logger.log(
        `Histórico de ${symbol}: ${quotes.length} cierres y ${splits.length} splits cacheados`,
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

  /**
   * Símbolos, de entre los pedidos, cuyos splits nunca se consultaron (cacheados antes de que
   * existieran) o se consultaron hace más de `SPLITS_REFRESH_DAYS`: sin la marca, "sin filas en
   * `instrument_splits`" no distingue "sin splits" de "nunca consultado", y un split posterior al
   * priming no se vería nunca.
   */
  private async symbolsWithStaleSplits(symbols: readonly string[]): Promise<string[]> {
    if (symbols.length === 0) return [];
    const cutoff = new Date(Date.now() - SPLITS_REFRESH_DAYS * MS_PER_DAY);
    const rows = await this.db
      .select()
      .from(instrumentSplitChecks)
      .where(inArray(instrumentSplitChecks.symbol, [...symbols]));
    const checkedAt = new Map(rows.map((r) => [r.symbol, r.checkedAt]));
    return symbols.filter((symbol) => {
      const at = checkedAt.get(symbol);
      return !at || at < cutoff;
    });
  }

  /**
   * Reconsulta los splits de los símbolos en uso sin marca o con marca de más de 7 días (una
   * llamada de histórico por símbolo, con pausa). Lo llama el cron nocturno: acotado a
   * 1 llamada por símbolo y semana, no a una por noche.
   */
  async refreshStaleSplits(): Promise<void> {
    const symbols = await this.resolveSymbols(await this.distinctTickers());
    await this.ensureHistory(new Map(), await this.symbolsWithStaleSplits(symbols));
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

  /** Upsert de un lote de cotizaciones en `instrument_prices` (1 fila por símbolo y día). */
  private upsertQuotes(quotes: Map<string, Quote>): Promise<void> {
    return this.upsertQuoteList([...quotes.values()]);
  }

  /**
   * Upsert de una LISTA de cotizaciones. Se inserta por bloques en vez de fila a fila porque
   * un histórico de 5 años son ~1.280 filas por símbolo: una sentencia por fila multiplicaría por
   * 200 los viajes a la BD durante un alta, que es una ruta síncrona del usuario.
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
