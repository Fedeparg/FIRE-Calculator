import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { portfolioHistoryQuerySchema, type PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import type { PortfolioHistoryDto } from '@sextante/core/portfolio/types';
import { PortfolioSnapshotsService } from './portfolio-snapshots.service.js';

/** Histórico de la cartera: siempre el del `userId` del JWT, nunca un id de la URL. */
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly snapshots: PortfolioSnapshotsService) {}

  @Get('history')
  history(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(portfolioHistoryQuerySchema)) query: PortfolioHistoryQueryDto,
  ): Promise<PortfolioHistoryDto> {
    return this.snapshots.history(user.id, query.days, query.display);
  }
}
