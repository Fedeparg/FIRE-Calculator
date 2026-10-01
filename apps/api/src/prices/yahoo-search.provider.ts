import { Injectable, Logger } from '@nestjs/common';

import type { InstrumentSearchProvider, InstrumentSearchResult, InstrumentType } from './instrument-search.js';

/** Endpoint público de autocompletado de Yahoo (mismo que alimenta su buscador web). */
const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
/** Resultados a pedir: suficientes para cubrir el instrumento buscado sin saturar la UI. */
const QUOTES_COUNT = 8;
const REQUEST_TIMEOUT_MS = 8_000;
/**
 * User-Agent MÍNIMO a propósito (igual que el proveedor de precios): Yahoo rate-limita los
 * UA que imitan un navegador completo desde IPs de datacenter, pero deja pasar uno mínimo.
 */
const USER_AGENT = 'Mozilla/5.0';
/** Longitud mínima de consulta: por debajo, no merece la pena llamar a la fuente. */
export const MIN_QUERY_LENGTH = 2;

/** `quoteType` de Yahoo → nuestro tipo normalizado. Los no contemplados caen en 'other'. */
const TYPE_MAP: Record<string, InstrumentType> = {
  EQUITY: 'equity',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  CRYPTOCURRENCY: 'crypto',
  INDEX: 'index',
  CURRENCY: 'currency',
};
/** Tipos que NO ofrecemos (derivados que no encajan en una cartera al uso). */
const EXCLUDED_TYPES = new Set(['FUTURE', 'OPTION', 'ECNQUOTE']);

/** Forma (parcial) de un resultado de la búsqueda de Yahoo. */
interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
}
interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

/**
 * Parsea la respuesta de la búsqueda de Yahoo a nuestra forma. Función pura: descarta los
 * resultados sin símbolo o sin nombre y los tipos excluidos (futuros/opciones), y normaliza
 * el tipo. Todo el parseo frágil vive aquí, aislado de la E/S.
 */
export function parseYahooSearch(body: unknown): InstrumentSearchResult[] {
  const quotes = (body as YahooSearchResponse)?.quotes;
  if (!Array.isArray(quotes)) return [];

  const out: InstrumentSearchResult[] = [];
  for (const q of quotes) {
    const symbol = q.symbol?.trim();
    const name = (q.longname ?? q.shortname)?.trim();
    const rawType = q.quoteType?.toUpperCase() ?? '';
    if (!symbol || !name || EXCLUDED_TYPES.has(rawType)) continue;
    out.push({
      symbol,
      name,
      type: TYPE_MAP[rawType] ?? 'other',
      exchange: q.exchDisp?.trim() || q.exchange?.trim() || null,
    });
  }
  return out;
}

/**
 * Proveedor de búsqueda sobre el endpoint de autocompletado de Yahoo. Gratis y sin clave, a
 * cambio de ser no oficial: por eso vive tras `InstrumentSearchProvider` y se puede sustituir
 * por una fuente de pago. A diferencia del refresco de precios, esto SÍ se dispara en la ruta
 * del usuario (búsqueda mientras teclea), por lo que el frontend aplica debounce.
 */
@Injectable()
export class YahooInstrumentSearchProvider implements InstrumentSearchProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooInstrumentSearchProvider.name);

  async search(query: string): Promise<InstrumentSearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(q)}` + `&quotesCount=${QUOTES_COUNT}&newsCount=0`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Yahoo search "${q}": HTTP ${res.status}`);
        return [];
      }
      return parseYahooSearch(await res.json());
    } catch (error) {
      // Un fallo de búsqueda no debe romper la UI: degradamos a "sin resultados".
      this.logger.warn(`Yahoo search "${q}": ${(error as Error).message}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
