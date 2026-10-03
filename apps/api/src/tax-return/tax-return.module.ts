import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { FxReferenceModule } from '../fx-reference/fx-reference.module.js';
import { IncomeModule } from '../income/income.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnController } from './tax-return.controller.js';
import { TaxReturnService } from './tax-return.service.js';

/** Renta (income tax return) report: pending balances from previous years and the savings base built on the server. */
@Module({
  imports: [SessionModule, PositionsModule, IncomeModule, FxReferenceModule],
  controllers: [TaxReturnController],
  providers: [PendingBalancesService, TaxReturnService],
  // Also used by the MCP tool `get_tax_return_report`.
  exports: [PendingBalancesService, TaxReturnService],
})
export class TaxReturnModule {}
