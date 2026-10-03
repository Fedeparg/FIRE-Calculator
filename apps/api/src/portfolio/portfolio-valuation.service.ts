import { Injectable, NotFoundException } from '@nestjs/common';

import type { PositionResponse } from '../positions/position.mapper.js';
import { PositionsService } from '../positions/positions.service.js';
import { PriceReadService, type FxRates, type PriceInfo } from '../prices/price-read.service.js';
import { aggregatePortfolio, type PortfolioAggregate } from '@sextante/core/portfolio/aggregate';
import { buildBreakdown, type BreakdownGroupBy, type BreakdownResult } from '@sextante/core/portfolio/breakdown';

const UNKNOWN_BROKER_LABEL = 'Sin bróker';

/**
 * Valuation of one position with its P&L in its native currency. Like the UI table
 * (`PositionList`): it is only computed with a price in the position's own currency;
 * conversion lives in the aggregate.
 */
export interface PositionValuation {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivative: Sextante does not track its price and it stays out of the aggregate. */
  isDerivative: boolean;
  /** Cost (quantity · average price), in the position's currency. */
  invested: number;
  /** Latest market price in the position's currency, or null if it cannot be valued. */
  currentPrice: number | null;
  /** Currency of the cached price (may differ from the position's). */
  priceCurrency: string | null;
  /** Date (YYYY-MM-DD) of the latest price, or null. */
  priceDate: string | null;
  /** Current value (quantity · price), in the position's currency, or null. */
  marketValue: number | null;
  /** Absolute gain/loss (value − invested), or null. */
  pnlAbs: number | null;
  /** Return in %, or null. */
  pnlPct: number | null;
  /** Whether it could be valued (there is a price in the same currency). */
  priced: boolean;
  /** Why it was not valued, if applicable. */
  unpricedReason?: 'no_price' | 'currency_mismatch';
}

/**
 * Prices (by ticker) and FX rates already read from the cache. The nightly capture reads them ONCE
 * for all portfolios instead of once per user; a ticker without a price is simply absent.
 */
export interface MarketData {
  prices: ReadonlyMap<string, PriceInfo>;
  fx: FxRates;
}

/** Full portfolio valuation: aggregate (with FX) + per-position breakdown (native). */
export interface PortfolioValuation {
  display: string;
  aggregate: PortfolioAggregate;
  /** Date of the FX rates used for the aggregate, or null. */
  fxAsOf: string | null;
  positions: PositionValuation[];
}

/**
 * Portfolio market value and P&L on top of `PositionsService` (per-user scoping) and
 * `PriceReadService` (cached prices and FX), with the same `aggregatePortfolio` as the UI. Serves
 * the read-only MCP tools (`_local/mcp-integracion.md`).
 */
@Injectable()
export class PortfolioValuationService {
  constructor(
    private readonly positions: PositionsService,
    private readonly prices: PriceReadService,
  ) {}

  /** `market`: prices and FX already read (see `MarketData`); without it, they are read for this user. */
  async valuate(userId: string, display: string, market?: MarketData): Promise<PortfolioValuation> {
    const { owned, priceMap, pricesRecord, fx } = await this.loadUserMarketData(userId, market);

    const aggregate = aggregatePortfolio({
      positions: owned.map((p) => ({
        ticker: p.ticker,
        quantity: p.quantity,
        avgPrice: p.avgPrice,
        currency: p.currency,
        isDerivative: p.isDerivative,
      })),
      prices: pricesRecord,
      rates: fx.rates,
      display,
    });

    return {
      display,
      aggregate,
      fxAsOf: fx.asOf,
      positions: owned.map((p) => this.valuateRow(p, priceMap.get(p.ticker))),
    };
  }

  /** Value breakdown by asset, broker or currency in `display` (the UI donut's `buildBreakdown`). */
  async breakdown(
    userId: string,
    display: string,
    groupBy: BreakdownGroupBy,
  ): Promise<BreakdownResult & { display: string; fxAsOf: string | null }> {
    const { owned, pricesRecord, fx } = await this.loadUserMarketData(userId);
    const result = buildBreakdown({
      // As on the web: derivatives have no reliable price and are left out of the breakdown.
      positions: owned.filter((p) => !p.isDerivative),
      prices: pricesRecord,
      rates: fx.rates,
      display,
      groupBy,
      unknownBrokerLabel: UNKNOWN_BROKER_LABEL,
    });
    return { ...result, display, fxAsOf: fx.asOf };
  }

  /** Prices of the given tickers and FX rates, read from the cache in two queries. */
  async loadMarketData(tickers: readonly string[]): Promise<MarketData> {
    const prices = await this.prices.getPrices([...new Set(tickers)]);
    const fx = await this.prices.getFxRates();
    return { prices, fx };
  }

  private async loadUserMarketData(userId: string, market?: MarketData) {
    const owned = await this.positions.findAllByUser(userId);
    const { prices, fx } = market ?? (await this.loadMarketData(owned.map((p) => p.ticker)));
    const priceMap = new Map<string, PriceInfo>();
    for (const p of owned) {
      const price = prices.get(p.ticker);
      if (price) priceMap.set(p.ticker, price);
    }

    const pricesRecord: Record<string, { close: number; currency: string }> = {};
    for (const [ticker, info] of priceMap) {
      pricesRecord[ticker] = { close: info.close, currency: info.currency };
    }
    return { owned, priceMap, pricesRecord, fx };
  }

  /** Values one position by id; `findAllByUser` already scopes by user, so another user's id gives a 404. */
  async valuateOne(userId: string, id: string): Promise<PositionValuation> {
    const owned = await this.positions.findAllByUser(userId);
    const position = owned.find((p) => p.id === id);
    if (!position) {
      throw new NotFoundException('Posición no encontrada');
    }
    const priceMap = await this.prices.getPrices([position.ticker]);
    return this.valuateRow(position, priceMap.get(position.ticker));
  }

  private valuateRow(p: PositionResponse, price?: PriceInfo): PositionValuation {
    const invested = p.quantity * p.avgPrice;
    // P&L requires a price in the position's own currency.
    const priced = price !== undefined && price.currency === p.currency;

    let currentPrice: number | null = null;
    let marketValue: number | null = null;
    let pnlAbs: number | null = null;
    let pnlPct: number | null = null;
    if (price !== undefined && price.currency === p.currency) {
      currentPrice = price.close;
      marketValue = p.quantity * price.close;
      pnlAbs = marketValue - invested;
      pnlPct = p.avgPrice > 0 ? ((price.close - p.avgPrice) / p.avgPrice) * 100 : null;
    }

    return {
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      quantity: p.quantity,
      avgPrice: p.avgPrice,
      broker: p.broker,
      currency: p.currency,
      isDerivative: p.isDerivative,
      invested,
      currentPrice,
      priceCurrency: price?.currency ?? null,
      priceDate: price?.date ?? null,
      marketValue,
      pnlAbs,
      pnlPct,
      priced,
      unpricedReason: price === undefined ? 'no_price' : !priced ? 'currency_mismatch' : undefined,
    };
  }
}
