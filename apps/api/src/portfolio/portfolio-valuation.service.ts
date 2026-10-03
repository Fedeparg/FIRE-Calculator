import { Injectable, NotFoundException } from '@nestjs/common';

import type { PositionResponse } from '../positions/position.mapper.js';
import { PositionsService } from '../positions/positions.service.js';
import { PriceReadService, type FxRates, type PriceInfo } from '../prices/price-read.service.js';
import { aggregatePortfolio, type PortfolioAggregate } from '@sextante/core/portfolio/aggregate';
import { buildBreakdown, type BreakdownGroupBy, type BreakdownResult } from '@sextante/core/portfolio/breakdown';

const UNKNOWN_BROKER_LABEL = 'Sin bróker';

/**
 * Valoración de una posición con su P&L en divisa nativa. Como la tabla de la UI
 * (`PositionList`): solo se calcula con precio en la misma divisa que la posición; la
 * conversión vive en el agregado.
 */
export interface PositionValuation {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
  /** Derivado: Sextante no sigue su precio y queda fuera del agregado. */
  isDerivative: boolean;
  /** Coste (cantidad · precio medio), en la divisa de la posición. */
  invested: number;
  /** Último precio de mercado en la divisa de la posición, o null si no es valorable. */
  currentPrice: number | null;
  /** Divisa del precio cacheado (puede no coincidir con la de la posición). */
  priceCurrency: string | null;
  /** Fecha (YYYY-MM-DD) del último precio, o null. */
  priceDate: string | null;
  /** Valor actual (cantidad · precio), en la divisa de la posición, o null. */
  marketValue: number | null;
  /** Ganancia/pérdida absoluta (valor − invertido), o null. */
  pnlAbs: number | null;
  /** Rentabilidad en %, o null. */
  pnlPct: number | null;
  /** ¿Se pudo valorar (hay precio en la misma divisa)? */
  priced: boolean;
  /** Por qué no se valoró, si procede. */
  unpricedReason?: 'no_price' | 'currency_mismatch';
}

/**
 * Precios (por ticker) y tasas FX ya leídos de la caché. La captura nocturna los lee UNA vez para
 * todas las carteras en vez de una por usuario; un ticker sin precio simplemente no está.
 */
export interface MarketData {
  prices: ReadonlyMap<string, PriceInfo>;
  fx: FxRates;
}

/** Valoración completa de la cartera: agregado (con FX) + desglose por posición (nativo). */
export interface PortfolioValuation {
  display: string;
  aggregate: PortfolioAggregate;
  /** Fecha de las tasas FX usadas para el agregado, o null. */
  fxAsOf: string | null;
  positions: PositionValuation[];
}

/**
 * Valor de mercado y P&L de la cartera sobre `PositionsService` (scoping por usuario) y
 * `PriceReadService` (precios y FX cacheados), con el mismo `aggregatePortfolio` que la UI. Sirve
 * a las tools MCP de lectura (`_local/mcp-integracion.md`).
 */
@Injectable()
export class PortfolioValuationService {
  constructor(
    private readonly positions: PositionsService,
    private readonly prices: PriceReadService,
  ) {}

  /** `market`: precios y FX ya leídos (ver `MarketData`); sin él, se leen para este usuario. */
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

  /** Reparto del valor por activo, bróker o divisa en `display` (el `buildBreakdown` del donut de la UI). */
  async breakdown(
    userId: string,
    display: string,
    groupBy: BreakdownGroupBy,
  ): Promise<BreakdownResult & { display: string; fxAsOf: string | null }> {
    const { owned, pricesRecord, fx } = await this.loadUserMarketData(userId);
    const result = buildBreakdown({
      // Como la web: los derivados no tienen precio fiable y no entran en el reparto.
      positions: owned.filter((p) => !p.isDerivative),
      prices: pricesRecord,
      rates: fx.rates,
      display,
      groupBy,
      unknownBrokerLabel: UNKNOWN_BROKER_LABEL,
    });
    return { ...result, display, fxAsOf: fx.asOf };
  }

  /** Precios de los tickers indicados y tasas FX, leídos de la caché en dos consultas. */
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

  /** Valora una posición por id; `findAllByUser` ya scopea por usuario, así que un id ajeno da 404. */
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
    // El P&L exige precio en la misma divisa que la posición.
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
