import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import type { PendingNegative } from '@sextante/core/fiscal/savings-base';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { replacePendingBalancesSchema, type ReplacePendingBalancesDto } from './dto/pending-balances.dto.js';
import { PendingBalancesService } from './pending-balances.service.js';

/** Datos de la declaración que no salen de la cartera. */
@Controller('tax-return')
@UseGuards(JwtAuthGuard)
export class TaxReturnController {
  constructor(private readonly pending: PendingBalancesService) {}

  @Get('pending-balances')
  listPending(@CurrentUser() user: SessionUser): Promise<PendingNegative[]> {
    return this.pending.list(user.id);
  }

  @Put('pending-balances')
  replacePending(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(replacePendingBalancesSchema)) dto: ReplacePendingBalancesDto,
  ): Promise<PendingNegative[]> {
    return this.pending.replace(user.id, dto);
  }
}
