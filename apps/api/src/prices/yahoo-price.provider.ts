import { Injectable, Logger } from '@nestjs/common';

import type { PriceProvider, Quote } from './price-provider.interface';

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

/** Forma (parcial) de la respuesta de Yahoo que nos interesa. */
interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  regularMarketTime?: number; // epoch en segundos
}
interface YahooChartResponse {
  chart?: { result?: { meta?: YahooChartMeta }[] | null; error?: unknown };
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
  if (
    typeof regularMarketPrice !== 'number' ||
    !Number.isFinite(regularMarketPrice) ||
    typeof currency !== 'string'
  ) {
    return null;
  }
  const date =
    typeof regularMarketTime === 'number'
      ? epochToUtcDate(regularMarketTime)
      : new Date().toISOString().slice(0, 10);
  return { symbol, close: regularMarketPrice, currency, date };
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
   * Pide un símbolo con reintentos (backoff) ante 429/5xx. Devuelve `null` ante cualquier
   * fallo definitivo: un símbolo malo no debe romper el refresco del resto del lote.
   */
  private async fetchOne(symbol: string): Promise<Quote | null> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
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

        const quote = parseYahooChart(symbol, await res.json());
        if (!quote) {
          this.logger.warn(`Yahoo ${symbol}: respuesta sin precio utilizable`);
        }
        return quote;
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
