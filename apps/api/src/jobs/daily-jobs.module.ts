import { Module } from '@nestjs/common';

import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { DailyJobsScheduler } from './daily-jobs.scheduler.js';

/**
 * Orquestador de los trabajos nocturnos de la cartera (refresco de precios → snapshots).
 * Vive por ENCIMA de `PricesModule` y `PortfolioModule` e importa a los dos, que es lo que
 * permite encadenarlos sin crear un ciclo entre ellos (ver `DailyJobsScheduler`).
 */
@Module({
  imports: [PricesModule, PortfolioModule],
  providers: [DailyJobsScheduler],
})
export class DailyJobsModule {}
