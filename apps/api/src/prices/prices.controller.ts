import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { pricesQuerySchema, type PricesQueryDto } from './dto/prices-query.dto.js';
import { PriceHistoryService, type RefreshSummary } from './price-history.service.js';
import { PriceReadService, type FxRates, type PriceInfo } from './price-read.service.js';

/** Prices: reads come from our DB; only the daily cron (or the dev manual refresh) hits the external source. */
@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricesController {
  constructor(
    private readonly prices: PriceReadService,
    private readonly history: PriceHistoryService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * `?symbols=AAPL,EUNL.DE,BTC-USD` → latest price of each ticker, keyed by the original ticker.
   * At most `MAX_PRICE_SYMBOLS` symbols of 20 characters (400 otherwise).
   */
  @Get()
  async get(
    @Query(new ZodValidationPipe(pricesQuerySchema)) query: PricesQueryDto,
  ): Promise<Record<string, PriceInfo>> {
    const prices = await this.prices.getPrices(query.symbols);
    return Object.fromEntries(prices);
  }

  /** FX rates (USD per unit of currency) to convert the aggregated portfolio total. */
  @Get('fx')
  async fx(): Promise<FxRates> {
    return this.prices.getFxRates();
  }

  /** Manual refresh for development only: blocked in production so it does not expose a trigger of external traffic. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(): Promise<RefreshSummary> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new ForbiddenException('El refresco manual está deshabilitado en producción');
    }
    return this.history.refreshAll();
  }
}
