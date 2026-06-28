import { Module } from '@nestjs/common';

import { PositionsModule } from '../positions/positions.module';
import { PricesModule } from '../prices/prices.module';
import { PortfolioValuationService } from './portfolio-valuation.service';

/**
 * Compone valor de mercado y P&L de la cartera reutilizando `PositionsService` y
 * `PricesService` (sin duplicar acceso a datos ni cálculo). Lo consumen las tools MCP de
 * lectura (`get_portfolio_valuation`, `get_position`).
 */
@Module({
  imports: [PositionsModule, PricesModule],
  providers: [PortfolioValuationService],
  exports: [PortfolioValuationService],
})
export class PortfolioModule {}
