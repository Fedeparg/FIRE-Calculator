import { Module } from '@nestjs/common';

import { IncomeModule } from '../income/income.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { PostImportTasks } from './post-import.tasks.js';
import { TradeImportWriter } from './trade-import.writer.js';
import { TradeRepublicImportPlanner } from './trade-republic-import.planner.js';
import { SessionModule } from '../auth/session.module.js';

/** Importación de operaciones desde brókers (hoy Trade Republic), sobre los lotes y precios de `PositionsModule`/`PricesModule`. */
@Module({
  imports: [PositionsModule, PricesModule, SessionModule, IncomeModule],
  controllers: [ImportsController],
  providers: [ImportsService, TradeRepublicImportPlanner, TradeImportWriter, PostImportTasks],
})
export class ImportsModule {}
