import { Injectable, Logger } from '@nestjs/common';

/**
 * API de datos del BCE (ECB Data Portal, SDMX): series diarias `EXR.D.<DIVISA>.EUR.SP00.A`,
 * "ECB reference exchange rate", publicadas hacia las 16:00 CET. Sin clave ni rate-limit
 * documentado; aun así se pide poco (un tramo por divisa y la caché es permanente).
 */
const ECB_DATA_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';
const REQUEST_TIMEOUT_MS = 15_000;

/** Una publicación de una divisa. */
export interface EcbRate {
  currency: string;
  date: string;
  unitsPerEur: number;
}

/** Fuente de tipos de referencia, inyectable por token para poder simularla en los tests. */
export interface ReferenceRatesProvider {
  readonly name: string;
  /**
   * Publicaciones de `currencies` entre `from` y `to` (incluidos). Una divisa sin serie no da
   * filas. Lanza ante un fallo de red o de la fuente: quien llama no debe dar por cubierto el tramo.
   */
  getRates(currencies: readonly string[], from: string, to: string): Promise<EcbRate[]>;
}

export const REFERENCE_RATES_PROVIDER = Symbol('REFERENCE_RATES_PROVIDER');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Parsea el CSV `format=csvdata&detail=dataonly` (pura). Localiza las columnas por nombre de la
 * cabecera en vez de por posición; descarta filas con fecha, divisa o valor inválidos.
 */
export function parseEcbCsv(text: string): EcbRate[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split(',');
  const currencyAt = header.indexOf('CURRENCY');
  const dateAt = header.indexOf('TIME_PERIOD');
  const valueAt = header.indexOf('OBS_VALUE');
  if (currencyAt < 0 || dateAt < 0 || valueAt < 0) return [];

  const out: EcbRate[] = [];
  for (const line of lines.slice(1)) {
    // Con `detail=dataonly` ninguna celda lleva comas ni comillas.
    const cells = line.split(',');
    const currency = cells[currencyAt];
    const date = cells[dateAt];
    const unitsPerEur = Number(cells[valueAt]);
    if (!CURRENCY.test(currency ?? '') || !DATE.test(date ?? '')) continue;
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
    // Varias divisas en una sola petición: la clave SDMX admite `USD+CHF`.
    const url =
      `${ECB_DATA_URL}/D.${valid.join('+')}.EUR.SP00.A` +
      `?startPeriod=${from}&endPeriod=${to}&format=csvdata&detail=dataonly`;

    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    // 404 = ninguna de las series existe en ese tramo: no es un error, es "sin datos".
    if (response.status === 404) return [];
    if (!response.ok) {
      this.logger.warn(`ECB respondió ${response.status} para ${valid.join(',')} ${from}..${to}`);
      throw new Error(`ECB responded ${response.status}`);
    }
    return parseEcbCsv(await response.text());
  }
}
