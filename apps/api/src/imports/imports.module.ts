import { Module } from '@nestjs/common';

import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { SessionModule } from '../auth/session.module.js';

/** Importación de operaciones desde brókers (hoy Trade Republic), sobre los lotes y precios de `PositionsModule`/`PricesModule`. */
@Module({
  imports: [PositionsModule, PricesModule, SessionModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
