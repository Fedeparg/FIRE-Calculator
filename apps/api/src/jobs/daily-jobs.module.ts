import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { DailyJobsScheduler } from './daily-jobs.scheduler.js';

/** Orquesta los trabajos nocturnos por encima de `PricesModule` y `PortfolioModule` para evitar un ciclo entre ellos. */
@Module({
  imports: [PricesModule, PortfolioModule, NotificationsModule],
  providers: [DailyJobsScheduler],
})
export class DailyJobsModule {}
