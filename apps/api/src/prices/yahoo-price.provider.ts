import { compareStrings } from '@sextante/core/compare';
import { Injectable, Logger } from '@nestjs/common';

import type { DividendEvent, PriceHistory, PriceProvider, Quote, SplitEvent } from './price-provider.interface.js';
import { isoDate, todayUtc } from '../common/dates.js';
import { fetchJson, sleep, type RetryPolicy } from '../common/http.js';
import { YAHOO_USER_AGENT } from './yahoo-http.js';

/** Yahoo's public v8 `chart` endpoint: works per symbol with no crumb or cookie. */
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
/** Pause between requests: Yahoo rate-limits bursts per IP (429). */
const REQUEST_DELAY_MS = 500;
/** Retries on 429 / 5xx, with backoff. */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const REQUEST_TIMEOUT_MS = 12_000;
/** Retries on 429 / 5xx and on network failures, with a linear wait. */
const RETRY: RetryPolicy = {
  max: MAX_RETRIES,
  baseMs: RETRY_BASE_MS,
  retryOn: isUnavailableStatus,
};
/**
 * Consecutive "source down" failures (network, timeout, 5xx or 429 after exhausting retries) after
 * which the batch is cut short: with Yahoo down each symbol spends ~40 s on retries and a refresh of
 * dozens of symbols would block the cron for hours. A symbol without a price (404, body without a
 * quote) does NOT count: it is a bad symbol, not the source.
 */
const MAX_CONSECUTIVE_OUTAGES = 5;
/** Total budget of a `getQuotes` batch: below the hour between two intraday runs. */
const QUOTES_BATCH_BUDGET_MS = 15 * 60_000;

/** 429 and 5xx: the source is unavailable (retried and, once exhausted, counted as an outage). */
function isUnavailableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Result of requesting a `chart`: the body, or the failure telling a source outage from a bad symbol. */
type ChartOutcome = { ok: true; body: unknown } | { ok: false; outage: boolean };

/**
 * Five years of daily closes (~1,280 bars, ~135 kB) fit in one call to the same endpoint with a
 * different `range`/`interval`, at the same request cost as a single close. It is the cap of the
 * portfolio rebuild (`HISTORY_MAX_DAYS` in `price-history.service.ts`).
 */
const HISTORY_RANGE = '5y';
const HISTORY_INTERVAL = '1d';

/** (Partial) shape of the Yahoo response we care about. */
interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  regularMarketTime?: number; // epoch in seconds
}
interface YahooChartResult {
  meta?: YahooChartMeta;
  /** Epoch (seconds) of each bar, index-aligned with `indicators.quote[0].close`. */
  timestamp?: unknown;
  /**
   * With `events=div|split`: `{ splits: { "<epoch>": { date, numerator, denominator } },
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

/** Converts an epoch (seconds) to a YYYY-MM-DD date in UTC. */
export function epochToUtcDate(epochSeconds: number): string {
  return isoDate(new Date(epochSeconds * 1000));
}

/** Extracts a `Quote` from the Yahoo response, or `null` if an essential field is missing. Pure: the fragile parsing lives here, isolated from I/O. */
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
 * Extracts the daily close series from a `chart` response (pure). Yahoo returns `timestamp[]`
 * and `indicators.quote[0].close[]` index-aligned, with `close: null` on non-trading days: those
 * are skipped, not coerced (a fake 0 would ruin the chart). If two bars fall on the same UTC day
 * the last one wins (the closest to the real close).
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

/** Extracts the splits from a response with `events=split` (pure); an invalid ratio would corrupt the historical quantity, so it is dropped. */
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
 * Extracts the per-share dividends from a response with `events=div` (pure), in the quote currency
 * (`meta.currency`). A non-positive amount or an invalid date is dropped: bogus data would produce a
 * made-up withholding tax at source.
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

/** Prices from Yahoo's unofficial API: broad and free, which is why it lives behind `PriceProvider`. */
@Injectable()
export class YahooPriceProvider implements PriceProvider {
  readonly name = 'yahoo';
  private readonly logger = new Logger(YahooPriceProvider.name);
  /** Public so tests can shorten them (like `historyRequestDelayMs` in `PriceHistoryService`). */
  requestDelayMs = REQUEST_DELAY_MS;
  batchBudgetMs = QUOTES_BATCH_BUDGET_MS;
  retry: RetryPolicy = RETRY;

  /**
   * Latest quote of each symbol. Sequential with a pause (volume is low and this avoids the 429),
   * with two circuit breakers so a Yahoo outage does not block the cron: it stops after
   * `MAX_CONSECUTIVE_OUTAGES` consecutive source failures and when the batch budget runs out.
   */
  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
    const result = new Map<string, Quote>();
    const budget = AbortSignal.timeout(this.batchBudgetMs);
    let consecutiveOutages = 0;

    for (const [i, symbol] of unique.entries()) {
      if (i > 0) await sleep(this.requestDelayMs);
      if (budget.aborted) {
        this.logger.error(
          `Yahoo: ${this.batchBudgetMs} ms budget exhausted; ${unique.length - i} symbols not requested`,
        );
        break;
      }
      const outcome = await this.fetchChart(symbol, '1d', '1d', undefined, budget);
      if (outcome.ok) {
        consecutiveOutages = 0;
        const quote = parseYahooChart(symbol, outcome.body);
        if (quote) result.set(quote.symbol, quote);
        else this.logger.warn(`Yahoo ${symbol}: response without a usable price`);
        continue;
      }
      consecutiveOutages = outcome.outage ? consecutiveOutages + 1 : 0;
      if (consecutiveOutages >= MAX_CONSECUTIVE_OUTAGES) {
        this.logger.error(
          `Yahoo looks down (${consecutiveOutages} consecutive network, 5xx or 429 failures): ` +
            `skipping the remaining ${unique.length - i - 1} symbols of the batch`,
        );
        break;
      }
    }
    return result;
  }

  /** One request with the same retries and timeout as the refresh; empty series on any failure. */
  async getHistory(symbol: string): Promise<PriceHistory> {
    const clean = symbol.trim();
    if (!clean) return { quotes: [], splits: [], dividends: [] };

    // Splits and dividends come in the same call.
    const outcome = await this.fetchChart(clean, HISTORY_RANGE, HISTORY_INTERVAL, 'div|split');
    if (!outcome.ok) return { quotes: [], splits: [], dividends: [] };

    const quotes = parseYahooChartHistory(clean, outcome.body);
    if (quotes.length === 0) {
      this.logger.warn(`Yahoo ${clean}: empty or unusable history`);
    }
    return {
      quotes,
      splits: parseYahooSplits(clean, outcome.body),
      dividends: parseYahooDividends(clean, outcome.body),
    };
  }

  /**
   * Requests the `chart` with retries (backoff) on 429/5xx; on a final failure it reports whether
   * the source (`outage`) or the symbol was at fault, so a bad symbol does not break the batch. The
   * body is returned unparsed (`unknown`).
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
    const exhausted = result.status !== undefined && outage ? ' (no retries left)' : '';
    this.logger.warn(`Yahoo ${symbol}: ${result.error}${exhausted}`);
    return { ok: false, outage };
  }
}
