import { Injectable, NotFoundException } from '@nestjs/common';

import { PositionsService, type PositionResponse } from '../positions/positions.service.js';
import { PricesService, type PriceInfo } from '../prices/prices.service.js';
import { aggregatePortfolio, type PortfolioAggregate } from './valuation.js';

/**
 * Valoración de UNA posición, con su P&L en divisa NATIVA. Misma regla que la tabla de la
 * UI (`PositionList`): el P&L solo se calcula si hay precio Y viene en la misma divisa que
 * la posición (no mezclamos divisas en la fila; la conversión vive en el agregado).
 */
export interface PositionValuation {
  id: string;
  ticker: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  broker: string | null;
  currency: string;
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

/** Valoración completa de la cartera: agregado (con FX) + desglose por posición (nativo). */
export interface PortfolioValuation {
  display: string;
  aggregate: PortfolioAggregate;
  /** Fecha de las tasas FX usadas para el agregado, o null. */
  fxAsOf: string | null;
  positions: PositionValuation[];
}

/**
 * Compone valor de mercado y P&L de la cartera reutilizando `PositionsService` (scoping por
 * usuario, aislamiento ya probado) y `PricesService` (precios + FX cacheados). NO duplica la
 * lógica de cálculo: usa `aggregatePortfolio` (espejo de `src/core/fx.ts`). Sirve a las tools
 * MCP de lectura. Ver `_local/mcp-integracion.md`.
 */
@Injectable()
export class PortfolioValuationService {
  constructor(
    private readonly positions: PositionsService,
    private readonly prices: PricesService,
  ) {}

  /** Valora toda la cartera del usuario, con el agregado convertido a `display`. */
  async valuate(userId: string, display: string): Promise<PortfolioValuation> {
    const owned = await this.positions.findAllByUser(userId);
    const tickers = [...new Set(owned.map((p) => p.ticker))];
    const priceMap = await this.prices.getPrices(tickers);
    const fx = await this.prices.getFxRates();

    const pricesRecord: Record<string, { close: number; currency: string }> = {};
    for (const [ticker, info] of priceMap) {
      pricesRecord[ticker] = { close: info.close, currency: info.currency };
    }

    const aggregate = aggregatePortfolio({
      positions: owned.map((p) => ({
        ticker: p.ticker,
        quantity: p.quantity,
        avgPrice: p.avgPrice,
        currency: p.currency,
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

  /**
   * Valora UNA posición del usuario por id. Reutiliza `findAllByUser` (que ya scopea por
   * `userId`), de modo que un id de OTRO usuario simplemente no aparece → 404. Así se
   * mantiene el aislamiento sin código nuevo.
   */
  async valuateOne(userId: string, id: string): Promise<PositionValuation> {
    const owned = await this.positions.findAllByUser(userId);
    const position = owned.find((p) => p.id === id);
    if (!position) {
      throw new NotFoundException('Posición no encontrada');
    }
    const priceMap = await this.prices.getPrices([position.ticker]);
    return this.valuateRow(position, priceMap.get(position.ticker));
  }

  /** P&L por fila en divisa nativa (misma regla de divisa que la UI). */
  private valuateRow(p: PositionResponse, price?: PriceInfo): PositionValuation {
    const invested = p.quantity * p.avgPrice;
    // El P&L exige precio Y en la misma divisa que la posición (no mezclamos divisas).
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
      invested,
      currentPrice,
      priceCurrency: price?.currency ?? null,
      priceDate: price?.date ?? null,
      marketValue,
      pnlAbs,
      pnlPct,
      priced,
      unpricedReason:
        price === undefined ? 'no_price' : !priced ? 'currency_mismatch' : undefined,
    };
  }
}
