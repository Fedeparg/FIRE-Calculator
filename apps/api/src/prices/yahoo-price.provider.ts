import { compareStrings } from '@sextante/core/compare';
import { Injectable, Logger } from '@nestjs/common';

import type { DividendEvent, PriceHistory, PriceProvider, Quote, SplitEvent } from './price-provider.interface.js';
import { isoDate, todayUtc } from '../common/dates.js';
import { fetchJson, sleep, type RetryPolicy } from '../common/http.js';
import { YAHOO_USER_AGENT } from './yahoo-http.js';

/** Endpoint público v8 `chart` de Yahoo: funciona por símbolo sin crumb ni cookie. */
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
/** Pausa entre peticiones: Yahoo rate-limita por IP (429) en ráfaga. */
const REQUEST_DELAY_MS = 500;
/** Reintentos ante 429 / 5xx, con backoff. */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const REQUEST_TIMEOUT_MS = 12_000;
/** Reintentos ante 429 / 5xx y ante fallos de red, con espera lineal. */
const RETRY: RetryPolicy = {
  max: MAX_RETRIES,
  baseMs: RETRY_BASE_MS,
  retryOn: isUnavailableStatus,
};
/**
 * Fallos de "fuente caída" (red, timeout, 5xx o 429 tras agotar reintentos) seguidos a partir de
 * los que se corta el lote: con Yahoo caído cada símbolo gasta ~40 s en reintentos y un refresco
 * de decenas de símbolos bloquearía el cron horas. Un símbolo sin precio (404, cuerpo sin
 * cotización) NO cuenta: es un símbolo malo, no la fuente.
 */
const MAX_CONSECUTIVE_OUTAGES = 5;
/** Presupuesto total de un lote de `getQuotes`: por debajo de la hora que separa dos intradía. */
const QUOTES_BATCH_BUDGET_MS = 15 * 60_000;

/** 429 y 5xx: la fuente no está disponible (se reintenta y, agotado, cuenta como caída). */
function isUnavailableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Resultado de pedir un `chart`: el cuerpo, o el fallo distinguiendo la fuente caída de un símbolo malo. */
type ChartOutcome = { ok: true; body: unknown } | { ok: false; outage: boolean };

/**
 * Cinco años de cierres diarios (~1.280 barras, ~135 kB) caben en una llamada al mismo
 * endpoint con otro `range`/`interval`, al mismo coste en peticiones que un solo cierre. Es el
 * tope de la reconstrucción de la cartera (`HISTORY_MAX_DAYS` en `prices.service.ts`).
 */
const HISTORY_RANGE = '5y';
const HISTORY_INTERVAL = '1d';

/** Forma (parcial) de la respuesta de Yahoo que nos interesa. */
interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  regularMarketTime?: number; // epoch en segundos
}
interface YahooChartResult {
  meta?: YahooChartMeta;
  /** Epoch (segundos) de cada barra, alineado por índice con `indicators.quote[0].close`. */
  timestamp?: unknown;
  /**
   * Con `events=div|split`: `{ splits: { "<epoch>": { date, numerator, denominator } },
   * dividends: { "<epoch>": { date, amount } } }`.
   */
  events?: {
    splits?: Record<string, { date?: unknown; numerator?: unknown; denominator?: unknown }>;
    dividends?: Record<string, { date?: unknown; amount?: unknown }>;
  };
  indicators?: { quote?: { close?: unknown }[] };
}
interface YahooChartResponse {
  chart?: { result?: YahooChartResult[] | null; error?: unknown };
}

/** Convierte un epoch (segundos) a fecha YYYY-MM-DD en UTC. */
export function epochToUtcDate(epochSeconds: number): string {
  return isoDate(new Date(epochSeconds * 1000));
}

/** Extrae una `Quote` de la respuesta de Yahoo, o `null` si falta algún dato esencial. Pura: el parseo frágil vive aquí, aislado de la E/S. */
export function parseYahooChart(symbol: string, body: unknown): Quote | null {
  const meta = (body as YahooChartResponse)?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const { regularMarketPrice, currency, regularMarketTime } = meta;
  if (typeof regularMarketPrice !== 'number' || !Number.isFinite(regularMarketPrice) || typeof currency !== 'string') {
    return null;
  }
  const date = typeof regularMarketTime === 'number' ? epochToUtcDate(regularMarketTime) : todayUtc();
  return { symbol, close: regularMarketPrice, currency, date };
}

/**
 * Extrae la serie de cierres diarios de una respuesta `chart` (pura). Yahoo devuelve
 * `timestamp[]` e `indicators.quote[0].close[]` alineados por índice, con `close: null` en los
 * días sin negociación: se saltan, no se coercionan (un 0 falso arruinaría la evolución). Si dos
 * barras caen el mismo día UTC gana la última (la más cercana al cierre real).
 */
export function parseYahooChartHistory(symbol: string, body: unknown): Quote[] {
  const result = (body as YahooChartResponse)?.chart?.result?.[0];
  const currency = result?.meta?.currency;
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (typeof currency !== 'string' || !Array.isArray(timestamps) || !Array.isArray(closes)) {
    return [];
  }

  const byDate = new Map<string, Quote>();
  for (let i = 0; i < timestamps.length; i++) {
    const epoch: unknown = timestamps[i];
    const close: unknown = closes[i];
    if (typeof epoch !== 'number' || !Number.isFinite(epoch)) continue;
    if (typeof close !== 'number' || !Number.isFinite(close)) continue;
    const date = epochToUtcDate(epoch);
    byDate.set(date, { symbol, close, currency, date });
  }

  return [...byDate.values()].sort((a, b) => compareStrings(a.date, b.date));
}

/** Extrae los splits de una respuesta con `events=split` (pura); un ratio inválido corrompería la cantidad histórica, así que se descartan. */
export function parseYahooSplits(symbol: string, body: unknown): SplitEvent[] {
  const splits = (body as YahooChartResponse)?.chart?.result?.[0]?.events?.splits;
  if (!splits || typeof splits !== 'object') return [];

  const out: SplitEvent[] = [];
  for (const split of Object.values(splits)) {
    const { date, numerator, denominator } = split ?? {};
    if (
      typeof date !== 'number' ||
      typeof numerator !== 'number' ||
      typeof denominator !== 'number' ||
      !Number.isFinite(date) ||
      !(numerator > 0) ||
      !(denominator > 0)
    ) {
      continue;
    }
    out.push({ symbol, date: epochToUtcDate(date), ratio: numerator / denominator });
  }
  return out.sort((a, b) => compareStrings(a.date, b.date));
}

/**
 * Extrae los dividendos por acción de una respuesta con `events=div` (pura), en la divisa de
 * cotización (`meta.currency`). Un importe no positivo o una fecha inválida se descartan: un dato
 * falso daría una retención en origen inventada.
 */
export function parseYahooDividends(symbol: string, body: unknown): DividendEvent[] {
  const result = (body as YahooChartResponse)?.chart?.result?.[0];
  const currency = result?.meta?.currency;
  const dividends = result?.events?.dividends;
  if (typeof currency !== 'string' || !dividends || typeof dividends !== 'object') return [];

  const out: DividendEvent[] = [];
  for (const dividend of Object.values(dividends)) {
    const { date, amount } = dividend ?? {};
    if (typeof date !== 'number' || !Number.isFinite(date) || typeof amount !== 'number' || !(amount > 0)) continue;
    out.push({ symbol, exDate: epochToUtcDate(date), amount, currency });
  }
  return out.sort((a, b) => compareStrings(a.exDate, b.exDate));
}

/** Precios sobre la API no oficial de Yahoo: amplia y gratis, por eso vive tras `PriceProvider`. */
@Injectable()
export class YahooPriceProvider implements PriceProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooPriceProvider.name);
  /** Públicos para que los tests los acorten (como `historyRequestDelayMs` en `PricesService`). */
  requestDelayMs = REQUEST_DELAY_MS;
  batchBudgetMs = QUOTES_BATCH_BUDGET_MS;
  retry: RetryPolicy = RETRY;

  /**
   * Última cotización de cada símbolo. Secuencial con pausa (el volumen es bajo y así se evita el
   * 429), con dos cortacircuitos para que una caída de Yahoo no bloquee el cron: se para tras
   * `MAX_CONSECUTIVE_OUTAGES` fallos de fuente seguidos y al agotar el presupuesto del lote.
   */
  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
    const result = new Map<string, Quote>();
    const budget = AbortSignal.timeout(this.batchBudgetMs);
    let consecutiveOutages = 0;

    for (let i = 0; i < unique.length; i++) {
      if (i > 0) await sleep(this.requestDelayMs);
      if (budget.aborted) {
        this.logger.error(
          `Yahoo: presupuesto de ${this.batchBudgetMs} ms agotado; ${unique.length - i} símbolos sin pedir`,
        );
        break;
      }
      const outcome = await this.fetchChart(unique[i], '1d', '1d', undefined, budget);
      if (outcome.ok) {
        consecutiveOutages = 0;
        const quote = parseYahooChart(unique[i], outcome.body);
        if (quote) result.set(quote.symbol, quote);
        else this.logger.warn(`Yahoo ${unique[i]}: respuesta sin precio utilizable`);
        continue;
      }
      consecutiveOutages = outcome.outage ? consecutiveOutages + 1 : 0;
      if (consecutiveOutages >= MAX_CONSECUTIVE_OUTAGES) {
        this.logger.error(
          `Yahoo parece caído (${consecutiveOutages} fallos seguidos de red, 5xx o 429): ` +
            `se cortan los ${unique.length - i - 1} símbolos restantes del lote`,
        );
        break;
      }
    }
    return result;
  }

  /** Una petición con los mismos reintentos y timeout que el refresco; serie vacía ante cualquier fallo. */
  async getHistory(symbol: string): Promise<PriceHistory> {
    const clean = symbol.trim();
    if (!clean) return { quotes: [], splits: [], dividends: [] };

    // Splits y dividendos viajan en la misma llamada.
    const outcome = await this.fetchChart(clean, HISTORY_RANGE, HISTORY_INTERVAL, 'div|split');
    if (!outcome.ok) return { quotes: [], splits: [], dividends: [] };

    const quotes = parseYahooChartHistory(clean, outcome.body);
    if (quotes.length === 0) {
      this.logger.warn(`Yahoo ${clean}: histórico vacío o no utilizable`);
    }
    return {
      quotes,
      splits: parseYahooSplits(clean, outcome.body),
      dividends: parseYahooDividends(clean, outcome.body),
    };
  }

  /**
   * Pide el `chart` con reintentos (backoff) ante 429/5xx; ante un fallo definitivo devuelve si
   * fue la fuente (`outage`) o el símbolo, para que un símbolo malo no rompa el lote. El cuerpo
   * va sin parsear (`unknown`).
   */
  private async fetchChart(
    symbol: string,
    range: string,
    interval: string,
    events?: string,
    signal?: AbortSignal,
  ): Promise<ChartOutcome> {
    const url =
      `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}` +
      `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}` +
      (events ? `&events=${encodeURIComponent(events)}` : '');
    const result = await fetchJson(url, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': YAHOO_USER_AGENT },
      retry: this.retry,
      signal,
    });
    if (result.ok) return { ok: true, body: result.body };

    const outage = result.status === undefined || isUnavailableStatus(result.status);
    const exhausted = result.status !== undefined && outage ? ' (sin reintentos restantes)' : '';
    this.logger.warn(`Yahoo ${symbol}: ${result.error}${exhausted}`);
    return { ok: false, outage };
  }
}
