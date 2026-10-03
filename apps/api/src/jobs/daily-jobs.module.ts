import { Module } from '@nestjs/common';

import { IncomeModule } from '../income/income.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { DailyJobsScheduler } from './daily-jobs.scheduler.js';

/** Orchestrates the nightly jobs above `PricesModule` and `PortfolioModule` to avoid a cycle between them. */
@Module({
  imports: [PricesModule, PortfolioModule, NotificationsModule, IncomeModule, PositionsModule],
  providers: [DailyJobsScheduler],
})
export class DailyJobsModule {}
