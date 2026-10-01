import { Injectable, Logger } from '@nestjs/common';

import type { PriceHistory, PriceProvider, Quote, SplitEvent } from './price-provider.interface.js';

/** Endpoint público v8 `chart` de Yahoo: funciona por símbolo sin crumb ni cookie. */
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
/** Pausa entre peticiones: Yahoo rate-limita por IP (429) si se le dispara en ráfaga. */
const REQUEST_DELAY_MS = 500;
/** Reintentos ante 429 / 5xx, con backoff. */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
/** Timeout por petición. */
const REQUEST_TIMEOUT_MS = 12_000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * User-Agent MÍNIMO a propósito: comprobado empíricamente que Yahoo rate-limita (429) los
 * UA que imitan un navegador completo (Chrome) o `curl` desde IPs de datacenter, pero deja
 * pasar (200) uno mínimo como este. Contraintuitivo, pero es lo que funciona de forma estable.
 */
const USER_AGENT = 'Mozilla/5.0';

/**
 * Rango del histórico que se pide al dar de alta un símbolo. Cinco años de cierres diarios
 * (~1.280 barras, ~135 kB de JSON, comprobado en vivo con IWDA.AS) caben en UNA llamada al mismo
 * endpoint con otro `range`/`interval`: el coste en peticiones frente a la fuente es idéntico al
 * de pedir un solo cierre. 5 años es también el tope de la serie que reconstruye la cartera
 * (`HISTORY_MAX_DAYS` en `prices.service.ts`).
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
  /** Con `events=split`: `{ splits: { "<epoch>": { date, numerator, denominator } } }`. */
  events?: { splits?: Record<string, { date?: unknown; numerator?: unknown; denominator?: unknown }> };
  indicators?: { quote?: { close?: unknown }[] };
}
interface YahooChartResponse {
  chart?: { result?: YahooChartResult[] | null; error?: unknown };
}

/** Convierte un epoch (segundos) a fecha YYYY-MM-DD en UTC. */
export function epochToUtcDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Extrae una `Quote` de la respuesta de Yahoo, o `null` si falta algún dato esencial.
 * Función pura: todo el parseo frágil vive aquí, aislado de la E/S.
 */
export function parseYahooChart(symbol: string, body: unknown): Quote | null {
  const meta = (body as YahooChartResponse)?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const { regularMarketPrice, currency, regularMarketTime } = meta;
  if (typeof regularMarketPrice !== 'number' || !Number.isFinite(regularMarketPrice) || typeof currency !== 'string') {
    return null;
  }
  const date =
    typeof regularMarketTime === 'number' ? epochToUtcDate(regularMarketTime) : new Date().toISOString().slice(0, 10);
  return { symbol, close: regularMarketPrice, currency, date };
}

/**
 * Extrae la SERIE de cierres diarios de una respuesta `chart` con `range`/`interval`.
 * Función pura, como `parseYahooChart`.
 *
 * Yahoo devuelve dos arrays alineados por índice: `timestamp[]` e `indicators.quote[0].close[]`.
 * En esos arrays hay HUECOS: los días sin negociación (festivos de ese mercado, subastas
 * suspendidas) vienen con `close: null`. Se SALTAN, no se coercionan: un `null` convertido a 0
 * metería un cierre falso en la caché y arruinaría cualquier gráfica de evolución.
 *
 * La divisa (`meta.currency`) es la misma para toda la serie. Si dos barras cayesen en el
 * mismo día UTC, gana la última (es la más cercana al cierre real).
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

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Extrae los splits de una respuesta `chart` pedida con `events=split`. Función pura. Se descartan
 * los eventos con numerador/denominador no numéricos o no positivos: un ratio inválido
 * corrompería la cantidad histórica de la cartera.
 */
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
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Proveedor de precios sobre la API no oficial de Yahoo Finance. Cobertura amplia
 * (acciones, ETFs europeos con sufijo de mercado, cripto) y gratis, a cambio de ser no
 * oficial: por eso vive tras `PriceProvider` y se puede sustituir por una fuente de pago.
 */
@Injectable()
export class YahooPriceProvider implements PriceProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooPriceProvider.name);

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
    const result = new Map<string, Quote>();

    // Secuencial con pausa entre símbolos: el volumen diario es bajo y así evitamos el 429.
    for (let i = 0; i < unique.length; i++) {
      if (i > 0) await delay(REQUEST_DELAY_MS);
      const quote = await this.fetchOne(unique[i]);
      if (quote) result.set(quote.symbol, quote);
    }
    return result;
  }

  /**
   * Cinco años de cierres diarios en UNA sola petición al mismo endpoint (`range`/`interval`),
   * reutilizando el mismo camino de reintentos, backoff y timeout que el refresco: el trato
   * con los límites de Yahoo es idéntico. Devuelve una serie vacía ante cualquier fallo.
   */
  async getHistory(symbol: string): Promise<PriceHistory> {
    const clean = symbol.trim();
    if (!clean) return { quotes: [], splits: [] };

    // `events=split` viaja en la MISMA llamada: no cuesta una petición más.
    const body = await this.fetchChart(clean, HISTORY_RANGE, HISTORY_INTERVAL, 'split');
    if (body === null) return { quotes: [], splits: [] };

    const quotes = parseYahooChartHistory(clean, body);
    if (quotes.length === 0) {
      this.logger.warn(`Yahoo ${clean}: histórico vacío o no utilizable`);
    }
    return { quotes, splits: parseYahooSplits(clean, body) };
  }

  /** Última cotización de un símbolo, o `null` si no se pudo obtener. */
  private async fetchOne(symbol: string): Promise<Quote | null> {
    const body = await this.fetchChart(symbol, '1d', '1d');
    if (body === null) return null;

    const quote = parseYahooChart(symbol, body);
    if (!quote) {
      this.logger.warn(`Yahoo ${symbol}: respuesta sin precio utilizable`);
    }
    return quote;
  }

  /**
   * Pide el `chart` de un símbolo con reintentos (backoff) ante 429/5xx. Devuelve `null` ante
   * cualquier fallo definitivo: un símbolo malo no debe romper el refresco del resto del lote.
   * El cuerpo se devuelve SIN parsear (`unknown`): el parseo frágil vive en las funciones
   * puras `parseYahooChart` / `parseYahooChartHistory`.
   */
  private async fetchChart(symbol: string, range: string, interval: string, events?: string): Promise<unknown> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url =
          `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}` +
          `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}` +
          (events ? `&events=${encodeURIComponent(events)}` : '');
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });

        // 429 (rate-limit) o 5xx: reintentamos con backoff antes de rendirnos.
        if (res.status === 429 || res.status >= 500) {
          if (attempt < MAX_RETRIES) {
            await delay(RETRY_BASE_MS * attempt);
            continue;
          }
          this.logger.warn(`Yahoo ${symbol}: HTTP ${res.status} (sin reintentos restantes)`);
          return null;
        }
        if (!res.ok) {
          this.logger.warn(`Yahoo ${symbol}: HTTP ${res.status}`);
          return null;
        }

        return await res.json();
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_BASE_MS * attempt);
          continue;
        }
        this.logger.warn(`Yahoo ${symbol}: ${(error as Error).message}`);
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }
}
