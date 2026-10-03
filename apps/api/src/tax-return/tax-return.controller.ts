import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import type { PendingNegative } from '@sextante/core/fiscal/savings-base';
import { fiscalYearParamSchema } from '../common/dto/fiscal-year.js';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { replacePendingBalancesSchema, type ReplacePendingBalancesDto } from './dto/pending-balances.dto.js';
import { PendingBalancesService } from './pending-balances.service.js';
import { TaxReturnService, type TaxReturnReport } from './tax-return.service.js';

/** Tax return data that does not come from the portfolio, and the savings base report. */
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

  // Declared last: `:year` must not shadow the fixed routes above.
  @Get(':year')
  getReport(
    @CurrentUser() user: SessionUser,
    @Param('year', new ZodValidationPipe(fiscalYearParamSchema)) year: number,
  ): Promise<TaxReturnReport> {
    return this.report.build(user.id, year);
  }
}
