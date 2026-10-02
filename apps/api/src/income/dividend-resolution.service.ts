import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import { resolveWithMarket, type DividendFacts } from '@sextante/core/fiscal/dividend-resolution';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { incomeEvents, instrumentDividends, instrumentSplits, positions, type IncomeEventRow } from '../db/schema.js';
import { PricesService } from '../prices/prices.service.js';

/** Margen máximo entre la fecha ex-dividendo y la de pago. */
const MAX_EX_TO_PAY_DAYS = 100;
const MS_PER_DAY = 86_400_000;

/** Dividendo por acción de mercado de un símbolo, ya sin el ajuste por splits posteriores. */
type MarketDividend = { exDate: string; amount: number; currency: string };

/**
 * Completa los dividendos importados cuya retención en origen no se sabe, o solo se estima, con el
 * dividendo por acción de mercado (`instrument_dividends`, de Yahoo) × las acciones que da el
 * bróker (`@sextante/core/fiscal/dividend-resolution`, capa 2). Solo lee datos ya cacheados: no
 * llama a ninguna fuente externa, así que se puede repetir sin coste cuando llegan datos nuevos
 * (tras importar, tras el refresco de precios).
 */
@Injectable()
export class DividendResolutionService {
  private readonly logger = new Logger(DividendResolutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly prices: PricesService,
  ) {}

  /** Resuelve los dividendos pendientes de un usuario (o de todos). Devuelve cuántos ha completado. */
  async resolvePending(userId?: string): Promise<number> {
    const pending = await this.db
      .select({ event: incomeEvents, ticker: positions.ticker })
      .from(incomeEvents)
      .innerJoin(positions, eq(positions.id, incomeEvents.positionId))
      .where(
        and(
          eq(incomeEvents.kind, 'dividend'),
          isNotNull(incomeEvents.quantity),
          or(isNull(incomeEvents.withholdingOrigin), eq(incomeEvents.withholdingOriginSource, 'estimate')),
          ...(userId ? [eq(incomeEvents.userId, userId)] : []),
        ),
      );
    if (pending.length === 0) return 0;

    const symbolByTicker = await this.prices.resolveCachedTickers([...new Set(pending.map((p) => p.ticker))]);
    const market = await this.marketDividends([...new Set(symbolByTicker.values())]);

    let resolved = 0;
    for (const { event, ticker } of pending) {
      const symbol = symbolByTicker.get(ticker);
      const dividend = symbol ? matchDividend(market.get(symbol) ?? [], event) : null;
      if (!dividend || event.quantity === null) continue;

      const result = resolveWithMarket(factsOf(event), Number(event.quantity) * dividend.amount);
      if (!result || result.originSource !== 'market') continue;
      await this.db
        .update(incomeEvents)
        .set({
          gross: String(result.gross),
          grossSource: result.grossSource,
          withholdingOrigin: result.origin === null ? null : String(result.origin),
          withholdingOriginSource: result.originSource,
          withholdingSpain: String(result.spain),
        })
        .where(eq(incomeEvents.id, event.id));
      resolved++;
    }
    if (resolved > 0) this.logger.log(`Dividendos completados con el dato de mercado: ${resolved}`);
    return resolved;
  }

  /** Dividendos por acción de cada símbolo, sin el ajuste por los splits posteriores a su fecha ex. */
  private async marketDividends(symbols: readonly string[]): Promise<Map<string, MarketDividend[]>> {
    const out = new Map<string, MarketDividend[]>();
    if (symbols.length === 0) return out;
    const [dividends, splits] = await Promise.all([
      this.db
        .select()
        .from(instrumentDividends)
        .where(inArray(instrumentDividends.symbol, [...symbols]))
        .orderBy(asc(instrumentDividends.exDate)),
      this.db
        .select()
        .from(instrumentSplits)
        .where(inArray(instrumentSplits.symbol, [...symbols])),
    ]);
    for (const row of dividends) {
      // Yahoo divide el dividendo por cada split posterior (como los cierres): se deshace.
      const factor = splits
        .filter((split) => split.symbol === row.symbol && split.date > row.exDate)
        .reduce((product, split) => product * Number(split.ratio), 1);
      const list = out.get(row.symbol) ?? [];
      list.push({ exDate: row.exDate, amount: Number(row.amount) * factor, currency: row.currency });
      out.set(row.symbol, list);
    }
    return out;
  }
}

/**
 * Lo que dijo el bróker, reconstruido de lo guardado. Solo se resuelven cobros sin origen (lo
 * abonado es el íntegro guardado) o con un origen estimado (lo abonado es íntegro − origen).
 */
function factsOf(event: IncomeEventRow): DividendFacts {
  const gross = Number(event.gross);
  const origin = event.withholdingOrigin === null ? 0 : Number(event.withholdingOrigin);
  return {
    amount: Math.round((gross - origin) * 100) / 100,
    tax: Number(event.withholdingSpain),
    originalAmount: event.originalAmount === null ? null : Number(event.originalAmount),
    reported: event.reportedToAeat,
    country: event.country ?? '',
  };
}

/**
 * Último dividendo de mercado con fecha ex anterior al cobro (dentro de `MAX_EX_TO_PAY_DAYS`) y
 * en la divisa en la que se pagó. Una cotización en otra divisa (p. ej. una acción de EE. UU. en
 * Xetra) no sirve: compararía importes de divisas distintas.
 */
function matchDividend(dividends: readonly MarketDividend[], event: IncomeEventRow): MarketDividend | null {
  const currency = event.originalCurrency ?? 'EUR';
  const earliest = new Date(Date.parse(`${event.paidAt}T00:00:00Z`) - MAX_EX_TO_PAY_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  const candidates = dividends.filter(
    (d) => d.currency === currency && d.exDate <= event.paidAt && d.exDate >= earliest,
  );
  return candidates.at(-1) ?? null;
}
