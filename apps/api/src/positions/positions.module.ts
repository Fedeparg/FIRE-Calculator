import { Module } from '@nestjs/common';

import { PricesModule } from '../prices/prices.module.js';
import { PositionLotsController } from './position-lots.controller.js';
import { PositionLotsService } from './position-lots.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Posiciones (la foto que lee toda la app) y sus lotes (de los que se recalcula). Importa
 * `SessionModule` para `JwtAuthGuard` y `PricesModule` para el
 * precio en caliente de una posición nueva o editada.
 */
@Module({
  imports: [PricesModule, SessionModule],
  controllers: [PositionsController, PositionLotsController],
  providers: [PositionsService, PositionLotsService],
  // Reutilizados por la exportación RGPD (GET /auth/account/export) y las tools MCP de lotes.
  exports: [PositionsService, PositionLotsService],
})
export class PositionsModule {}
