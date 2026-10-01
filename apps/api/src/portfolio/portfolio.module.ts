import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';

/**
 * Valoración de cartera (tools MCP `get_portfolio_valuation`, `get_position`) y su histórico
 * (`PortfolioSnapshotsService`, que usa la misma valoración). Registra `JwtModule` con el
 * secreto de auth para que `JwtAuthGuard` valide la cookie en `GET /api/portfolio/history`.
 */
@Module({
  imports: [
    PositionsModule,
    PricesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioValuationService, PortfolioSnapshotsService, JwtAuthGuard],
  // Los snapshots se exportan al job diario y a las tools MCP de histórico.
  exports: [PortfolioValuationService, PortfolioSnapshotsService],
})
export class PortfolioModule {}
