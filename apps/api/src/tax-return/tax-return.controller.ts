import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { PendingNegative } from '@sextante/core/fiscal/savings-base';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { replacePendingBalancesSchema, type ReplacePendingBalancesDto } from './dto/pending-balances.dto.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnService, type TaxReturnReport } from './tax-return.service.js';

const yearSchema = z.coerce.number().int().min(1990).max(2100);

/** Datos de la declaración que no salen de la cartera, y el informe de la base del ahorro. */
@Controller('tax-return')
@UseGuards(JwtAuthGuard)
export class TaxReturnController {
  constructor(
    private readonly pending: PendingBalancesService,
    private readonly report: TaxReturnService,
  ) {}

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

  // Declarada la última: `:year` no debe tapar a las rutas fijas de arriba.
  @Get(':year')
  getReport(
    @CurrentUser() user: SessionUser,
    @Param('year', new ZodValidationPipe(yearSchema)) year: number,
  ): Promise<TaxReturnReport> {
    return this.report.build(user.id, year);
  }
}
