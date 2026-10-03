import { Module } from '@nestjs/common';

import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Portfolio valuation (MCP tools `get_portfolio_valuation`, `get_position`) and its history
 * (`PortfolioSnapshotsService`, which uses the same valuation). Imports `SessionModule` so
 * that `JwtAuthGuard` validates the cookie on `GET /api/portfolio/history`.
 */
@Module({
  imports: [PositionsModule, PricesModule, SessionModule],
  controllers: [PortfolioController],
  providers: [PortfolioValuationService, PortfolioSnapshotsService, SnapshotRepository],
  // Snapshots are exported to the daily job and to the MCP history tools.
  exports: [PortfolioValuationService, PortfolioSnapshotsService],
})
export class PortfolioModule {}
