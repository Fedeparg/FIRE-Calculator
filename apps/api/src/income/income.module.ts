import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { DividendResolutionService } from './dividend-resolution.service.js';
import { IncomeController } from './income.controller.js';
import { IncomeService } from './income.service.js';

/** Income payments (rendimientos del capital mobiliario, i.e. investment income). Also used by the import, MCP and the GDPR export. */
@Module({
  // `PricesModule`: the symbol resolution used to look up market dividends.
  imports: [SessionModule, PricesModule],
  controllers: [IncomeController],
  providers: [IncomeService, DividendResolutionService],
  exports: [IncomeService, DividendResolutionService],
})
export class IncomeModule {}
