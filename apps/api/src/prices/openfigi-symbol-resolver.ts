import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';

import { isIsin } from '@sextante/core/portfolio/isin';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { instruments } from '../db/schema.js';
import {
  INSTRUMENT_SEARCH,
  type InstrumentSearchProvider,
  type InstrumentSearchResult,
  type InstrumentType,
} from './instrument-search.js';
import { PRICE_PROVIDER, type PriceProvider } from './price-provider.interface.js';
import { normalizeQuery, type SymbolResolver } from './symbol-resolver.js';
import { fetchJson, sleep } from '../common/http.js';

/** OpenFIGI v3 endpoint (v2 EOL 2026-07-01). POST with a JSON body. */
const OPENFIGI_MAPPING_URL = 'https://api.openfigi.com/v3/mapping';
const OPENFIGI_TIMEOUT_MS = 8_000;
/** Yahoo suffixes in order of preference for a European investor (EUR first; London, in GBp, last). */
const YAHOO_SUFFIXES = ['.AS', '.DE', '.MI', '.PA', '.MC', '.SW', '.L'];
/**
 * Bloomberg exchCode (OpenFIGI) → Yahoo suffix; '' = US, where Yahoo uses the bare ticker. A
 * ticker is only tried with the suffix of the exchange where OpenFIGI lists it: the same ticker on
 * another exchange can be another product (`AMZN.AS` is an ETP on Amazon at ~€7, not the stock).
 * Codes not listed here (EO/EU composites, junk like XH/XF) are ignored.
 */
const EXCHANGE_SUFFIXES: ReadonlyMap<string, string> = new Map([
  ['NA', '.AS'],
  ['GY', '.DE'],
  ['GR', '.DE'],
  ['IM', '.MI'],
  ['FP', '.PA'],
  ['SM', '.MC'],
  ['SQ', '.MC'],
  ['SW', '.SW'],
  ['SE', '.SW'],
  ['LN', '.L'],
  ['US', ''],
  ['UN', ''],
  ['UW', ''],
  ['UQ', ''],
  ['UA', ''],
  ['UR', ''],
  ['UP', ''],
  ['UV', ''],
]);
/** Order in which suffixes are tried: European ones by preference, US last. */
const SUFFIX_ORDER = [...YAHOO_SUFFIXES, ''];
/** Cap on candidates validated per query (bounds traffic on a coverage gap). */
const MAX_CANDIDATES = 12;
/** Pause between validations: avoids bursts that trigger Yahoo's 429. */
const VALIDATION_DELAY_MS = 400;
/**
 * In-memory negative cache of queries that failed to resolve WITHOUT leaving a row in
 * `instruments` (transient failure, coverage gap, ticker without a quote). Without it, the hourly
 * refresh retried them against OpenFIGI and Yahoo every hour forever. Exponential backoff: 1 h,
 * 2 h, 4 h… up to 24 h; forgotten once resolved. It is lost on restart, which is acceptable: the
 * worst case is one extra retry.
 */
const NEGATIVE_BACKOFF_BASE_MS = 60 * 60_000;
const NEGATIVE_BACKOFF_MAX_MS = 24 * 60 * 60_000;
/** Entry cap so a flood of junk queries does not grow memory. */
const NEGATIVE_CACHE_MAX_ENTRIES = 1_000;

interface NegativeEntry {
  failures: number;
  nextTryAt: number;
}

/** Result of querying OpenFIGI for an ISIN. Tells a genuine "empty" apart from a transient failure. */
type OpenFigiOutcome =
  | { kind: 'matches'; listings: OpenFigiListing[] }
  | { kind: 'empty' } // OpenFIGI answered with no matches → it does not exist (cache it).
  | { kind: 'error' }; // network / HTTP / parsing → transient (do NOT cache, retry later).

/** A listing of the instrument on an exchange, as OpenFIGI reports it. */
export interface OpenFigiListing {
  ticker: string;
  exchCode?: string;
}
interface OpenFigiResultItem {
  data?: Partial<OpenFigiListing>[];
  warning?: string;
}

/**
 * Candidates for an ISIN: each listing's ticker with ITS exchange's suffix, in `SUFFIX_ORDER`
 * order. Within the same suffix the most repeated ticker goes first (the primary listing repeats
 * across sub-exchanges). Pure.
 */
export function isinCandidates(listings: readonly OpenFigiListing[]): string[] {
  const found = new Map<string, { rank: number; count: number }>();
  for (const { ticker, exchCode } of listings) {
    const suffix = exchCode ? EXCHANGE_SUFFIXES.get(exchCode.trim().toUpperCase()) : undefined;
    const tk = ticker.trim().toUpperCase();
    if (suffix === undefined || !tk) continue;
    const symbol = tk + suffix;
    const entry = found.get(symbol) ?? { rank: SUFFIX_ORDER.indexOf(suffix), count: 0 };
    entry.count += 1;
    found.set(symbol, entry);
  }
  // `sort` is stable: for equal suffix and frequency, OpenFIGI's order is kept.
  return [...found.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank || b.count - a.count)
    .map(([symbol]) => symbol)
    .slice(0, MAX_CANDIDATES);
}

/** Yahoo search types that can be the instrument behind an ISIN. */
const SEARCH_TYPES = new Set<InstrumentType>(['equity', 'etf', 'fund']);
/** Cap on search results validated against the source. */
const MAX_SEARCH_CANDIDATES = 5;

/**
 * Candidates for an ISIN from Yahoo search (which accepts the ISIN and returns that instrument's
 * listings): euro markets first, in `YAHOO_SUFFIXES` order (avoids currency conversion), then the
 * rest in Yahoo's order, which covers non-European securities (e.g. `.HK`). Pure.
 */
export function searchCandidates(results: readonly InstrumentSearchResult[]): string[] {
  const symbols = [
    ...new Set(results.filter((r) => SEARCH_TYPES.has(r.type)).map((r) => r.symbol.trim().toUpperCase())),
  ].filter(Boolean);
  const rank = (symbol: string): number => {
    const index = YAHOO_SUFFIXES.findIndex((suffix) => symbol.endsWith(suffix));
    return index === -1 ? YAHOO_SUFFIXES.length : index;
  };
  // `sort` is stable: for equal rank, Yahoo's order is kept.
  return symbols.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_SEARCH_CANDIDATES);
}

/**
 * Crypto that is a "<T>-USD" pair on Yahoo but whose bare ticker collides with a real security
 * (e.g. "BTC" is the Grayscale Bitcoin Mini Trust ETF, ~US$26, not Bitcoin). Safety net for bare
 * tickers that arrive without going through the search box (old data, API/MCP): it forces the pair
 * and does not fall back to the bare ticker.
 */
export const CRYPTO_TICKERS = new Set([
  'BTC',
  'ETH',
  'USDT',
  'BNB',
  'SOL',
  'XRP',
  'USDC',
  'ADA',
  'AVAX',
  'DOGE',
  'DOT',
  'TRX',
  'LINK',
  'MATIC',
  'TON',
  'SHIB',
  'LTC',
  'BCH',
  'XLM',
  'ATOM',
  'XMR',
  'ETC',
  'NEAR',
  'ALGO',
  'FIL',
  'ICP',
  'APT',
  'ARB',
  'OP',
  'UNI',
]);

/** Candidates for a bare ticker: bare first (US/already complete symbol), then suffixes. */
export function tickerCandidates(query: string): string[] {
  // If it already looks like a Yahoo symbol (EUNL.DE, BTC-USD), no suffixes are invented.
  if (query.includes('.') || query.includes('-')) return [query];
  // Known crypto: only the "-USD" pair; better not to resolve than to cache the wrong instrument.
  if (CRYPTO_TICKERS.has(query)) return [`${query}-USD`];
  const out = [query, ...YAHOO_SUFFIXES.map((s) => query + s)];
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * ISIN/ticker → Yahoo symbol resolver. For an ISIN it tries Yahoo search first and then OpenFIGI;
 * a candidate wins only if it actually has a quote. Search goes first because OpenFIGI returns
 * every listing (with tickers Yahoo does not know, such as "VAPUUSD") and only European suffixes
 * were tried, leaving ETFs with per-market tickers and Asian securities without a price. It caches
 * resolutions and genuine "not found" results in `instruments`; transient failures are not cached,
 * so a rate limit does not block a valid symbol. See `_local/datos-inversiones-api.md`.
 */
@Injectable()
export class OpenFigiSymbolResolver implements SymbolResolver {
  private readonly logger = new Logger(OpenFigiSymbolResolver.name);
  private readonly apiKey: string | undefined;
  private readonly negative = new Map<string, NegativeEntry>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PRICE_PROVIDER) private readonly provider: PriceProvider,
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
    config: ConfigService<Env, true>,
  ) {
    this.apiKey = config.get('OPENFIGI_API_KEY', { infer: true }) || undefined;
  }

  async resolveCached(tickerOrIsin: string): Promise<string | null> {
    return (await this.resolveManyCached([tickerOrIsin])).get(tickerOrIsin) ?? null;
  }

  async resolveManyCached(tickersOrIsins: readonly string[]): Promise<Map<string, string | null>> {
    const queryByInput = new Map(tickersOrIsins.map((input) => [input, normalizeQuery(input)]));
    const queries = [...new Set(queryByInput.values())].filter(Boolean);
    const rows =
      queries.length === 0
        ? []
        : await this.db
            .select({ query: instruments.query, symbol: instruments.symbol })
            .from(instruments)
            .where(inArray(instruments.query, queries));
    const symbolByQuery = new Map(rows.map((row) => [row.query, row.symbol]));
    return new Map([...queryByInput].map(([input, query]) => [input, symbolByQuery.get(query) ?? null]));
  }

  async resolve(tickerOrIsin: string): Promise<string | null> {
    const query = normalizeQuery(tickerOrIsin);
    if (!query) return null;

    const cached = await this.lookup(query);
    if (cached !== undefined) return cached; // hit: resolved symbol or null (not found).

    const backoff = this.negative.get(query);
    if (backoff && Date.now() < backoff.nextTryAt) return null;

    const symbol = await this.resolveUncached(query);
    if (symbol) this.negative.delete(query);
    else this.recordFailure(query);
    return symbol;
  }

  /** Records a failure with no cache row and postpones the next attempt (exponential backoff). */
  private recordFailure(query: string): void {
    const failures = (this.negative.get(query)?.failures ?? 0) + 1;
    const waitMs = Math.min(NEGATIVE_BACKOFF_BASE_MS * 2 ** (failures - 1), NEGATIVE_BACKOFF_MAX_MS);
    // Reinserting moves it to the end: `Map` keeps insertion order, so the first entry is the oldest.
    this.negative.delete(query);
    this.negative.set(query, { failures, nextTryAt: Date.now() + waitMs });
    if (this.negative.size > NEGATIVE_CACHE_MAX_ENTRIES) {
      const oldest = this.negative.keys().next().value;
      if (oldest !== undefined) this.negative.delete(oldest);
    }
  }

  /** Resolution against the external sources of a query with no cache row. */
  private async resolveUncached(query: string): Promise<string | null> {
    if (isIsin(query)) {
      // Search never throws: on failure it returns [] and we move on to OpenFIGI.
      const searched = await this.firstThatPrices(searchCandidates(await this.search.search(query)));
      if (searched) {
        await this.cache(query, searched, 'yahoo_search');
        return searched;
      }

      const outcome = await this.mapIsin(query);
      if (outcome.kind === 'error') return null; // transient: do not cache, retry.
      if (outcome.kind === 'empty') {
        await this.cache(query, null, 'not_found');
        return null;
      }
      const symbol = await this.firstThatPrices(isinCandidates(outcome.listings));
      if (symbol) {
        await this.cache(query, symbol, 'openfigi');
        return symbol;
      }
      // Matches without a quote: coverage gap or 429. Not cached; retried.
      this.logger.warn(`OpenFIGI ${query}: ${outcome.listings.length} listings, none has a quote`);
      return null;
    }

    // Bare ticker: usually it is already a Yahoo symbol.
    const symbol = await this.firstThatPrices(tickerCandidates(query));
    if (symbol) {
      await this.cache(query, symbol, 'identity');
      return symbol;
    }
    return null; // no quote: not cached (typo or transient).
  }

  /** First candidate with a quote at the source (order is priority), or null. */
  private async firstThatPrices(candidates: string[]): Promise<string | null> {
    for (const [i, candidate] of candidates.entries()) {
      if (i > 0) await sleep(VALIDATION_DELAY_MS);
      const quotes = await this.provider.getQuotes([candidate]);
      if (quotes.has(candidate)) return candidate;
    }
    return null;
  }

  /** Reads the cache. `undefined` = no row (miss); `null` = not found; string = symbol. */
  private async lookup(query: string): Promise<string | null | undefined> {
    const rows = await this.db
      .select({ symbol: instruments.symbol })
      .from(instruments)
      .where(eq(instruments.query, query))
      .limit(1);
    return rows[0]?.symbol;
  }

  /** Upsert of the resolution (permanent). A null `symbol` caches a genuine "not found". */
  private async cache(query: string, symbol: string | null, source: string): Promise<void> {
    await this.db
      .insert(instruments)
      .values({ query, symbol, source, resolvedAt: new Date() })
      .onConflictDoUpdate({
        target: instruments.query,
        set: { symbol, source, resolvedAt: new Date() },
      });
  }

  /** Queries OpenFIGI v3 by ISIN. Separates "no matches" (cache) from "failure" (retry). */
  private async mapIsin(isin: string): Promise<OpenFigiOutcome> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-OPENFIGI-APIKEY'] = this.apiKey;
    const result = await fetchJson(OPENFIGI_MAPPING_URL, {
      timeoutMs: OPENFIGI_TIMEOUT_MS,
      method: 'POST',
      headers,
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    });
    if (!result.ok) {
      this.logger.warn(`OpenFIGI ${isin}: ${result.error}`);
      return { kind: 'error' };
    }
    const body = result.body as OpenFigiResultItem[];
    const item = Array.isArray(body) ? body[0] : undefined;
    const data = item?.data;
    if (!data || data.length === 0) return { kind: 'empty' };
    // OpenFIGI sends `null` for fields it lacks: normalized to absent.
    const listings = data.flatMap(({ ticker, exchCode }) =>
      typeof ticker === 'string' && ticker
        ? [{ ticker, exchCode: typeof exchCode === 'string' ? exchCode : undefined }]
        : [],
    );
    return listings.length ? { kind: 'matches', listings } : { kind: 'empty' };
  }
}
