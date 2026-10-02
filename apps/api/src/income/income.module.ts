import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { DividendResolutionService } from './dividend-resolution.service.js';
import { IncomeController } from './income.controller.js';
import { IncomeService } from './income.service.js';

/** Cobros (rendimientos del capital mobiliario). Lo usan también la importación, MCP y el export RGPD. */
@Module({
  // `PricesModule`: la resolución de símbolos con la que se buscan los dividendos de mercado.
  imports: [SessionModule, PricesModule],
  controllers: [IncomeController],
  providers: [IncomeService, DividendResolutionService],
  exports: [IncomeService, DividendResolutionService],
})
export class IncomeModule {}
