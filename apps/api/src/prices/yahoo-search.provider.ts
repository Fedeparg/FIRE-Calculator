import { MIN_INSTRUMENT_QUERY_LENGTH } from '@sextante/core/contracts';
import { Injectable, Logger } from '@nestjs/common';

import type { InstrumentSearchProvider, InstrumentSearchResult, InstrumentType } from './instrument-search.js';
import { fetchJson } from '../common/http.js';
import { LruCache } from '../common/lru-cache.js';
import { YAHOO_USER_AGENT } from './yahoo-http.js';

const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const QUOTES_COUNT = 8;
const REQUEST_TIMEOUT_MS = 8_000;
/** Recent queries kept in memory: the search box repeats the same ones while typing and deleting. */
const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_MS = 10 * 60_000;

/** Yahoo `quoteType` → normalized type; unknown ones fall back to 'other'. */
const TYPE_MAP: Record<string, InstrumentType> = {
  EQUITY: 'equity',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  CRYPTOCURRENCY: 'crypto',
  INDEX: 'index',
  CURRENCY: 'currency',
};
/** Derivatives that do not fit a regular portfolio. */
const EXCLUDED_TYPES = new Set(['FUTURE', 'OPTION', 'ECNQUOTE']);

/** (Partial) shape of a Yahoo search result. */
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

/** Parses the Yahoo response (pure): drops results without symbol or name and excluded types; the fragile parsing lives here. */
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

/** Search on Yahoo's (unofficial) autocomplete. It fires on the user's path while typing: the frontend debounces. */
@Injectable()
export class YahooInstrumentSearchProvider implements InstrumentSearchProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooInstrumentSearchProvider.name);

  private readonly cache = new LruCache<string, InstrumentSearchResult[]>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);

  async search(query: string): Promise<InstrumentSearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_INSTRUMENT_QUERY_LENGTH) return [];

    const cached = this.cache.get(q);
    if (cached) return cached;

    const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(q)}` + `&quotesCount=${QUOTES_COUNT}&newsCount=0`;
    const result = await fetchJson(url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': YAHOO_USER_AGENT } });
    if (!result.ok) {
      // Degrade to "no results" so the UI does not break. Not cached: it is a transient failure.
      this.logger.warn(`Yahoo search "${q}": ${result.error}`);
      return [];
    }
    const results = parseYahooSearch(result.body);
    this.cache.set(q, results);
    return results;
  }
}
