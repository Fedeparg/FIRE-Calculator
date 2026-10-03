import { Module } from '@nestjs/common';

import { PricesModule } from '../prices/prices.module.js';
import { PositionLotsController } from './position-lots.controller.js';
import { PositionLotsService } from './position-lots.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';
import { AssetClassBackfillService } from './asset-class-backfill.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Positions (the snapshot the whole app reads) and their lots (from which it is recomputed).
 * Imports `SessionModule` for `JwtAuthGuard` and `PricesModule` for the on-the-fly price of a
 * new or edited position.
 */
@Module({
  imports: [PricesModule, SessionModule],
  controllers: [PositionsController, PositionLotsController],
  providers: [PositionsService, PositionLotsService, AssetClassBackfillService],
  // Reused by the GDPR export (GET /auth/account/export) and the MCP lot tools.
  exports: [PositionsService, PositionLotsService, AssetClassBackfillService],
})
export class PositionsModule {}
