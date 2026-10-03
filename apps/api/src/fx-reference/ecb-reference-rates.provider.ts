import { Injectable, Logger } from '@nestjs/common';
import { firstItem } from '@sextante/core/arrays';

import { fetchText } from '../common/http.js';

/**
 * ECB data API (ECB Data Portal, SDMX): daily series `EXR.D.<CURRENCY>.EUR.SP00.A`,
 * "ECB reference exchange rate", published around 16:00 CET. No key and no documented rate limit;
 * even so, few requests are made (one range per currency and the cache is permanent).
 */
const ECB_DATA_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';
const REQUEST_TIMEOUT_MS = 15_000;

/** One publication for one currency. */
export interface EcbRate {
  currency: string;
  date: string;
  unitsPerEur: number;
}

/** Reference rate source, injectable by token so tests can stub it. */
export interface ReferenceRatesProvider {
  readonly name: string;
  /**
   * Publications of `currencies` between `from` and `to` (inclusive). A currency without a series
   * yields no rows. Throws on a network or source failure: the caller must not mark the range as covered.
   */
  getRates(currencies: readonly string[], from: string, to: string): Promise<EcbRate[]>;
}

export const REFERENCE_RATES_PROVIDER = Symbol('REFERENCE_RATES_PROVIDER');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Parses the `format=csvdata&detail=dataonly` CSV (pure). It locates the columns by header name
 * rather than by position; it drops rows with an invalid date, currency or value.
 */
export function parseEcbCsv(text: string): EcbRate[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const header = firstItem(lines).split(',');
  const currencyAt = header.indexOf('CURRENCY');
  const dateAt = header.indexOf('TIME_PERIOD');
  const valueAt = header.indexOf('OBS_VALUE');
  if (currencyAt < 0 || dateAt < 0 || valueAt < 0) return [];

  const out: EcbRate[] = [];
  for (const line of lines.slice(1)) {
    // With `detail=dataonly` no cell contains commas or quotes.
    const cells = line.split(',');
    const currency = cells[currencyAt];
    const date = cells[dateAt];
    const unitsPerEur = Number(cells[valueAt]);
    if (currency === undefined || date === undefined || !CURRENCY.test(currency) || !DATE.test(date)) continue;
    if (!Number.isFinite(unitsPerEur) || unitsPerEur <= 0) continue;
    out.push({ currency, date, unitsPerEur });
  }
  return out;
}

@Injectable()
export class EcbReferenceRatesProvider implements ReferenceRatesProvider {
  readonly name = 'ecb';
  private readonly logger = new Logger(EcbReferenceRatesProvider.name);

  async getRates(currencies: readonly string[], from: string, to: string): Promise<EcbRate[]> {
    const valid = [...new Set(currencies)].filter((c) => CURRENCY.test(c));
    if (valid.length === 0) return [];
    // Several currencies in a single request: the SDMX key accepts `USD+CHF`.
    const url =
      `${ECB_DATA_URL}/D.${valid.join('+')}.EUR.SP00.A` +
      `?startPeriod=${from}&endPeriod=${to}&format=csvdata&detail=dataonly`;

    const result = await fetchText(url, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (result.ok) return parseEcbCsv(result.body);
    // 404 = none of the series exists in that range: not an error, just "no data".
    if (result.status === 404) return [];
    // Throw: the caller tells "no data" apart from "could not be loaded" (`ratesLoaded`).
    this.logger.warn(`ECB: ${result.error} for ${valid.join(',')} ${from}..${to}`);
    throw new Error(
      result.status === undefined ? `ECB request failed: ${result.error}` : `ECB responded ${result.status}`,
    );
  }
}
