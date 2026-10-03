import { Module } from '@nestjs/common';

import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Valoración de cartera (tools MCP `get_portfolio_valuation`, `get_position`) y su histórico
 * (`PortfolioSnapshotsService`, que usa la misma valoración). Importa `SessionModule`
 * para que `JwtAuthGuard` valide la cookie en `GET /api/portfolio/history`.
 */
@Module({
  imports: [PositionsModule, PricesModule, SessionModule],
  controllers: [PortfolioController],
  providers: [PortfolioValuationService, PortfolioSnapshotsService, SnapshotRepository],
  // Los snapshots se exportan al job diario y a las tools MCP de histórico.
  exports: [PortfolioValuationService, PortfolioSnapshotsService],
})
export class PortfolioModule {}
