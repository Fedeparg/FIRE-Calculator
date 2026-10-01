import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { PricesModule } from '../prices/prices.module.js';
import { PositionLotsController } from './position-lots.controller.js';
import { PositionLotsService } from './position-lots.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';

/**
 * Posiciones (la foto que lee toda la app) y sus lotes (de los que se recalcula). Registra
 * `JwtModule` con el secreto de auth para `JwtAuthGuard`; importa `PricesModule` para el
 * precio en caliente de una posición nueva o editada.
 */
@Module({
  imports: [
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
  controllers: [PositionsController, PositionLotsController],
  providers: [PositionsService, PositionLotsService, JwtAuthGuard],
  // Reutilizados por la exportación RGPD (GET /auth/account/export) y las tools MCP de lotes.
  exports: [PositionsService, PositionLotsService],
})
export class PositionsModule {}
