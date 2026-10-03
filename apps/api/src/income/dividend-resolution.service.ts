import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

import {
  estimateWithStatutoryRate,
  resolveWithMarket,
  type DividendFacts,
  type DividendResolution,
} from '@sextante/core/fiscal/dividend-resolution';
import { STATUTORY_DIVIDEND_WITHHOLDING } from '@sextante/core/fiscal/withholding-rates';
import { roundCents } from '@sextante/core/money';
import { addDays } from '../common/dates.js';
import { numberOrNull } from '../common/numeric.js';
import { DRIZZLE, type Database } from '../db/database.module.js';
import { incomeEvents, instrumentDividends, instrumentSplits, positions, type IncomeEventRow } from '../db/schema.js';
import { PriceReadService } from '../prices/price-read.service.js';

/** Maximum gap between the ex-dividend date and the payment date. */
const MAX_EX_TO_PAY_DAYS = 100;

/** A symbol's market dividend per share, with the adjustment for later splits already undone. */
type MarketDividend = { exDate: string; amount: number; currency: string };

/**
 * Completes the dividends whose withholding at source is unknown, or only estimated
 * (`@sextante/core/fiscal/dividend-resolution`): first with the market dividend per share
 * (`instrument_dividends`, from Yahoo) × the shares reported by the broker (layer 2) and, if there
 * is no market data, with the country's statutory rate flagged as an estimate (layer 3). It only
 * reads already cached data: it calls no external source, so it can be rerun at no cost when new
 * data arrives (after an import, after the price refresh).
 */
@Injectable()
export class DividendResolutionService {
  private readonly logger = new Logger(DividendResolutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly prices: PriceReadService,
  ) {}

  /** Resolves the pending dividends of one user (or of all). Returns how many it completed. */
  async resolvePending(userId?: string): Promise<number> {
    const pending = await this.db
      .select({ event: incomeEvents, ticker: positions.ticker })
      .from(incomeEvents)
      .leftJoin(positions, eq(positions.id, incomeEvents.positionId))
      .where(
        and(
          eq(incomeEvents.kind, 'dividend'),
          or(isNull(incomeEvents.withholdingOrigin), eq(incomeEvents.withholdingOriginSource, 'estimate')),
          ...(userId ? [eq(incomeEvents.userId, userId)] : []),
        ),
      );
    if (pending.length === 0) return 0;

    const tickers = pending.map((p) => p.ticker).filter((t): t is string => t !== null);
    const symbolByTicker = await this.prices.resolveCachedTickers([...new Set(tickers)]);
    const market = await this.marketDividends([...new Set(symbolByTicker.values())]);

    const updates = pending.flatMap(({ event, ticker }) => {
      const result = this.resolve(event, ticker ? symbolByTicker.get(ticker) : undefined, market);
      return result ? [{ id: event.id, result }] : [];
    });
    if (updates.length === 0) return 0;

    // All in one transaction: a single commit round trip instead of one per payment.
    await this.db.transaction(async (tx) => {
      for (const { id, result } of updates) {
        await tx
          .update(incomeEvents)
          .set({
            gross: String(result.gross),
            grossSource: result.grossSource,
            withholdingOrigin: result.origin === null ? null : String(result.origin),
            withholdingOriginSource: result.originSource,
            withholdingSpain: String(result.spain),
          })
          .where(eq(incomeEvents.id, id));
      }
    });
    this.logger.log(`Dividends completed with market data or an estimate: ${updates.length}`);
    return updates.length;
  }

  /** Layer 2 (market) and, without data, layer 3 (statutory rate); `null` if nothing changes. */
  private resolve(
    event: IncomeEventRow,
    symbol: string | undefined,
    market: ReadonlyMap<string, MarketDividend[]>,
  ): DividendResolution | null {
    const facts = factsOf(event);
    const dividend = symbol && event.quantity !== null ? matchDividend(market.get(symbol) ?? [], event) : null;
    if (dividend && event.quantity !== null) {
      const result = resolveWithMarket(facts, Number(event.quantity) * dividend.amount);
      if (result?.originSource === 'market') return result;
    }
    // An existing estimate is not redone; only what is unknown gets estimated.
    if (event.withholdingOrigin !== null) return null;
    const statutory = STATUTORY_DIVIDEND_WITHHOLDING[facts.country];
    return statutory ? estimateWithStatutoryRate(facts, statutory.rate) : null;
  }

  /** Dividends per share of each symbol, without the adjustment for splits after their ex-date. */
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
    const splitsBySymbol = new Map<string, (typeof splits)[number][]>();
    for (const split of splits) {
      const list = splitsBySymbol.get(split.symbol) ?? [];
      list.push(split);
      splitsBySymbol.set(split.symbol, list);
    }
    for (const row of dividends) {
      // Yahoo divides the dividend by every later split (like the closes): undo it.
      const factor = (splitsBySymbol.get(row.symbol) ?? [])
        .filter((split) => split.date > row.exDate)
        .reduce((product, split) => product * Number(split.ratio), 1);
      const list = out.get(row.symbol) ?? [];
      list.push({ exDate: row.exDate, amount: Number(row.amount) * factor, currency: row.currency });
      out.set(row.symbol, list);
    }
    return out;
  }
}

/**
 * What the broker reported, rebuilt from what is stored. Only payments without an origin
 * withholding (the amount paid out is the stored gross) or with an estimated one (the amount paid
 * out is gross − origin) are resolved.
 */
function factsOf(event: IncomeEventRow): DividendFacts {
  const gross = Number(event.gross);
  const origin = event.withholdingOrigin === null ? 0 : Number(event.withholdingOrigin);
  return {
    amount: roundCents(gross - origin),
    tax: Number(event.withholdingSpain),
    originalAmount: numberOrNull(event.originalAmount),
    reported: event.reportedToAeat,
    country: event.country ?? '',
  };
}

/**
 * Latest market dividend with an ex-date before the payment (within `MAX_EX_TO_PAY_DAYS`) and in
 * the currency it was paid in. A listing in another currency (e.g. a US stock on Xetra) is no use:
 * it would compare amounts in different currencies.
 */
function matchDividend(dividends: readonly MarketDividend[], event: IncomeEventRow): MarketDividend | null {
  const currency = event.originalCurrency ?? 'EUR';
  const earliest = addDays(event.paidAt, -MAX_EX_TO_PAY_DAYS);
  const candidates = dividends.filter(
    (d) => d.currency === currency && d.exDate <= event.paidAt && d.exDate >= earliest,
  );
  return candidates.at(-1) ?? null;
}
