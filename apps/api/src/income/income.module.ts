import { Module } from '@nestjs/common';

import { SessionModule } from '../auth/session.module.js';
import { IncomeController } from './income.controller.js';
import { IncomeService } from './income.service.js';

/** Cobros (rendimientos del capital mobiliario). Lo usan también la importación, MCP y el export RGPD. */
@Module({
  imports: [SessionModule],
  controllers: [IncomeController],
  providers: [IncomeService],
  exports: [IncomeService],
})
export class IncomeModule {}
