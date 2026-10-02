import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnController } from './tax-return.controller.js';

/** Informe de la Renta: datos propios de la declaración (saldos pendientes de años anteriores). */
@Module({
  imports: [SessionModule],
  controllers: [TaxReturnController],
  providers: [PendingBalancesService],
  exports: [PendingBalancesService],
})
export class TaxReturnModule {}
