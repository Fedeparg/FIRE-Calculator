import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SESSION_TTL_SECONDS } from '../auth/session.constants';
import { PricesModule } from '../prices/prices.module';
import { PositionLotsController } from './position-lots.controller';
import { PositionLotsService } from './position-lots.service';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

/**
 * Módulo de cartera: posiciones (la FOTO que lee toda la app) y sus lotes (la PELÍCULA de
 * compras y ventas de la que se recalcula esa foto). Registra JwtModule con el mismo secreto
 * que el de auth para que `JwtAuthGuard` verifique la cookie de sesión en estos endpoints. Importa
 * `PricesModule` para refrescar en caliente el precio de una posición recién dada de alta
 * o editada (sin esperar al cron diario).
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
  // Exportados para que el módulo de auth pueda reutilizarlos en la exportación RGPD
  // de datos del usuario (GET /auth/account/export) y para que las tools MCP de lotes
  // reutilicen el mismo servicio, sin duplicar el acceso a datos.
  exports: [PositionsService, PositionLotsService],
})
export class PositionsModule {}
