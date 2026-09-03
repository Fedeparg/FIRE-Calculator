import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SESSION_TTL_SECONDS } from '../auth/session.constants';
import { PositionsModule } from '../positions/positions.module';
import { PricesModule } from '../prices/prices.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service';
import { PortfolioValuationService } from './portfolio-valuation.service';

/**
 * Compone valor de mercado y P&L de la cartera reutilizando `PositionsService` y
 * `PricesService` (sin duplicar acceso a datos ni cálculo). Lo consumen las tools MCP de
 * lectura (`get_portfolio_valuation`, `get_position`).
 *
 * Aquí vive también el HISTÓRICO (`PortfolioSnapshotsService`): la serie diaria se calcula
 * con esa misma valoración, así que el punto de hoy en la gráfica y el total de la cartera
 * no pueden divergir. Registra `JwtModule` con el mismo secreto que auth para que
 * `JwtAuthGuard` valide la cookie de sesión en `GET /api/portfolio/history`.
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
  // `PortfolioSnapshotsService` se exporta para el job diario (`DailyJobsModule`) y para las
  // tools MCP de histórico.
  exports: [PortfolioValuationService, PortfolioSnapshotsService],
})
export class PortfolioModule {}
