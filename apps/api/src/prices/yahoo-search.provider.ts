import { MIN_INSTRUMENT_QUERY_LENGTH } from '@sextante/core/contracts';
import { Injectable, Logger } from '@nestjs/common';

import type { InstrumentSearchProvider, InstrumentSearchResult, InstrumentType } from './instrument-search.js';
import { fetchJson } from '../common/http.js';
import { YAHOO_USER_AGENT } from './yahoo-http.js';

const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const QUOTES_COUNT = 8;
const REQUEST_TIMEOUT_MS = 8_000;

/** `quoteType` de Yahoo → tipo normalizado; los no contemplados caen en 'other'. */
const TYPE_MAP: Record<string, InstrumentType> = {
  EQUITY: 'equity',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  CRYPTOCURRENCY: 'crypto',
  INDEX: 'index',
  CURRENCY: 'currency',
};
/** Derivados que no encajan en una cartera al uso. */
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

/** Parsea la respuesta de Yahoo (pura): descarta resultados sin símbolo o nombre y tipos excluidos; el parseo frágil vive aquí. */
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

/** Búsqueda sobre el autocompletado (no oficial) de Yahoo. Se dispara en la ruta del usuario mientras teclea: el frontend hace debounce. */
@Injectable()
export class YahooInstrumentSearchProvider implements InstrumentSearchProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooInstrumentSearchProvider.name);

  async search(query: string): Promise<InstrumentSearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_INSTRUMENT_QUERY_LENGTH) return [];

    const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(q)}` + `&quotesCount=${QUOTES_COUNT}&newsCount=0`;
    const result = await fetchJson(url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': YAHOO_USER_AGENT } });
    if (!result.ok) {
      // Degrada a "sin resultados" para no romper la UI.
      this.logger.warn(`Yahoo search "${q}": ${result.error}`);
      return [];
    }
    return parseYahooSearch(result.body);
  }
}
