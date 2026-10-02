import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { FxReferenceModule } from '../fx-reference/fx-reference.module.js';
import { IncomeModule } from '../income/income.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnController } from './tax-return.controller.js';
import { TaxReturnService } from './tax-return.service.js';

/** Informe de la Renta: saldos pendientes de años anteriores y la base del ahorro montada en el servidor. */
@Module({
  imports: [SessionModule, PositionsModule, IncomeModule, FxReferenceModule],
  controllers: [TaxReturnController],
  providers: [PendingBalancesService, TaxReturnService],
  // Lo usa también la tool MCP `get_tax_return_report`.
  exports: [PendingBalancesService, TaxReturnService],
})
export class TaxReturnModule {}
