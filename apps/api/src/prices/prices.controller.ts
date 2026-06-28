import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PricesService, type PriceInfo, type RefreshSummary } from './prices.service';

/**
 * Endpoints de precios. La lectura sale SIEMPRE de nuestra DB (caché), nunca de la API
 * externa: a la fuente externa solo va el cron diario (o el refresco manual de dev).
 */
@Controller('prices')
@UseGuards(JwtAuthGuard)
export class PricesController {
  constructor(
    private readonly prices: PricesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Último precio conocido (desde DB) de cada ticker pedido. `?symbols=AAPL,EUNL.DE,BTC-USD`.
   * Devuelve un objeto indexado por el ticker original.
   */
  @Get()
  async get(@Query('symbols') symbols?: string): Promise<Record<string, PriceInfo>> {
    const tickers = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const prices = await this.prices.getPrices(tickers);
    return Object.fromEntries(prices);
  }

  /**
   * Fuerza un refresco contra la fuente externa. Es una comodidad de DESARROLLO (en
   * producción lo hace el cron diario): se bloquea con NODE_ENV=production para no exponer
   * un disparador de tráfico externo.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(): Promise<RefreshSummary> {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('El refresco manual está deshabilitado en producción');
    }
    return this.prices.refreshAll();
  }
}
