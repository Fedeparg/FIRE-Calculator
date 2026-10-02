import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, gte, inArray, sql } from 'drizzle-orm';

import { MAX_RATE_GAP_DAYS, TAX_CURRENCY, type ReferenceRatePoint, type ReferenceRates } from '@sextante/core/fiscal/fx-reference';
import { isoDate, todayUtc } from '../common/dates.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { fxReferenceCoverage, fxReferenceRates } from '../db/schema.js';
import { REFERENCE_RATES_PROVIDER, type EcbRate, type ReferenceRatesProvider } from './ecb-reference-rates.provider.js';

/** Primera publicación del BCE (el euro nace el 1 de enero de 1999). */
export const ECB_FIRST_DATE = '1999-01-04';
/** Tope de divisas por petición: una cartera real tiene unas pocas. */
export const MAX_REFERENCE_CURRENCIES = 10;
/** Cada cuánto se vuelve a mirar el final de la serie, como mucho. */
const TAIL_REFRESH_MS = 6 * 3_600_000;

const CURRENCY = /^[A-Z]{3}$/;
const INSERT_CHUNK = 1_000;

function addDays(date: string, days: number): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
}

/**
 * Tipos de referencia del BCE con caché permanente en BD: las publicaciones pasadas no cambian,
 * así que cada tramo se descarga una sola vez. Solo el final de la serie se vuelve a pedir, como
 * mucho cada `TAIL_REFRESH_MS`, para recoger las publicaciones nuevas.
 */
@Injectable()
export class ReferenceRatesService {
  private readonly logger = new Logger(ReferenceRatesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REFERENCE_RATES_PROVIDER) private readonly provider: ReferenceRatesProvider,
  ) {}

  /**
   * Series de `currencies` desde `from` hasta hoy, listas para `referenceRateOn`. Incluye las
   * publicaciones de los días anteriores a `from` que hagan falta para una operación en festivo.
   * Si la fuente falla, devuelve lo que haya en caché: el informe marca lo que no pueda convertir.
   */
  async getRates(currencies: readonly string[], from: string): Promise<ReferenceRates> {
    const wanted = [...new Set(currencies)].filter((c) => c !== TAX_CURRENCY && CURRENCY.test(c));
    if (wanted.length === 0) return {};
    const start = [addDays(from, -MAX_RATE_GAP_DAYS), ECB_FIRST_DATE].sort().at(-1) ?? ECB_FIRST_DATE;
    const end = todayUtc();
    if (start > end) return Object.fromEntries(wanted.map((c) => [c, []]));

    await this.ensureCoverage(wanted, start, end);

    const rows = await this.db
      .select({ currency: fxReferenceRates.currency, date: fxReferenceRates.date, unitsPerEur: fxReferenceRates.unitsPerEur })
      .from(fxReferenceRates)
      .where(and(inArray(fxReferenceRates.currency, wanted), gte(fxReferenceRates.date, start)))
      .orderBy(asc(fxReferenceRates.currency), asc(fxReferenceRates.date));

    const series: Record<string, ReferenceRatePoint[]> = Object.fromEntries(wanted.map((c) => [c, []]));
    for (const row of rows) series[row.currency].push({ date: row.date, unitsPerEur: Number(row.unitsPerEur) });
    return series;
  }

  /** Descarga los tramos que falten de cada divisa y anota lo cubierto. */
  private async ensureCoverage(currencies: string[], start: string, end: string): Promise<void> {
    const coverage = new Map(
      (
        await this.db.select().from(fxReferenceCoverage).where(inArray(fxReferenceCoverage.currency, currencies))
      ).map((row) => [row.currency, row]),
    );
    const now = Date.now();

    for (const currency of currencies) {
      const known = coverage.get(currency);
      const ranges: [string, string][] = [];
      if (!known) {
        ranges.push([start, end]);
      } else {
        if (start < known.fromDate) ranges.push([start, addDays(known.fromDate, -1)]);
        const stale = now - known.checkedAt.getTime() > TAIL_REFRESH_MS;
        // Se repite la última semana por si la publicación de aquel día aún no había salido.
        if (known.toDate < end && stale) ranges.push([addDays(known.toDate, -MAX_RATE_GAP_DAYS), end]);
      }

      let fromDate = known?.fromDate;
      let toDate = known?.toDate;
      let fetched = false;
      for (const [rangeFrom, rangeTo] of ranges) {
        try {
          await this.store(await this.provider.getRates([currency], rangeFrom, rangeTo));
        } catch (error) {
          // Sin anotar la cobertura: el tramo se reintentará en la próxima petición.
          this.logger.warn(`No se pudieron descargar los tipos ${currency} ${rangeFrom}..${rangeTo}: ${String(error)}`);
          continue;
        }
        fetched = true;
        fromDate = fromDate === undefined || rangeFrom < fromDate ? rangeFrom : fromDate;
        toDate = toDate === undefined || rangeTo > toDate ? rangeTo : toDate;
      }
      if (!fetched || fromDate === undefined || toDate === undefined) continue;

      await this.db
        .insert(fxReferenceCoverage)
        .values({ currency, fromDate, toDate, checkedAt: new Date() })
        .onConflictDoUpdate({
          target: fxReferenceCoverage.currency,
          set: { fromDate, toDate, checkedAt: new Date() },
        });
    }
  }

  /** Inserta por bloques: una serie desde 1999 son ~7.000 filas y Postgres limita los parámetros por sentencia. */
  private async store(rates: EcbRate[]): Promise<void> {
    for (let i = 0; i < rates.length; i += INSERT_CHUNK) {
      await this.db
        .insert(fxReferenceRates)
        .values(
          rates
            .slice(i, i + INSERT_CHUNK)
            .map((r) => ({ currency: r.currency, date: r.date, unitsPerEur: String(r.unitsPerEur), source: this.provider.name })),
        )
        .onConflictDoUpdate({
          target: [fxReferenceRates.currency, fxReferenceRates.date],
          set: { unitsPerEur: sql`excluded.units_per_eur`, fetchedAt: new Date() },
        });
    }
  }
}
