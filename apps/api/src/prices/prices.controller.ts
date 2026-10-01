import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PricesService, type FxRates, type PriceInfo, type RefreshSummary } from './prices.service.js';

/** Precios: la lectura sale de nuestra DB; a la fuente externa solo va el cron diario (o el refresco manual de dev). */
@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricesController {
  constructor(
    private readonly prices: PricesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** `?symbols=AAPL,EUNL.DE,BTC-USD` → último precio de cada ticker, indexado por el ticker original. */
  @Get()
  async get(@Query('symbols') symbols?: string): Promise<Record<string, PriceInfo>> {
    const tickers = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const prices = await this.prices.getPrices(tickers);
    return Object.fromEntries(prices);
  }

  /** Tasas FX (USD por unidad de divisa) para convertir el total agregado de la cartera. */
  @Get('fx')
  async fx(): Promise<FxRates> {
    return this.prices.getFxRates();
  }

  /** Refresco manual solo para desarrollo: bloqueado en producción para no exponer un disparador de tráfico externo. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(): Promise<RefreshSummary> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new ForbiddenException('El refresco manual está deshabilitado en producción');
    }
    return this.prices.refreshAll();
  }
}
