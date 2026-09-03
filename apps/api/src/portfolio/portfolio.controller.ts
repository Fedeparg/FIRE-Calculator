import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import {
  PortfolioSnapshotsService,
  type PortfolioHistory,
} from './portfolio-snapshots.service.js';

/**
 * Histórico de la cartera. Autenticado y scopeado por el `userId` del JWT, como el resto:
 * la serie que se devuelve es SIEMPRE la del usuario de la sesión, nunca la de un id que
 * venga por la URL.
 */
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly snapshots: PortfolioSnapshotsService) {}

  /** `?days=90&display=USD` → serie de valoración diaria, ya reexpresada a esa divisa. */
  @Get('history')
  history(
    @CurrentUser() user: SessionUser,
    @Query() query: PortfolioHistoryQueryDto,
  ): Promise<PortfolioHistory> {
    return this.snapshots.history(user.id, query.days, query.display);
  }
}
