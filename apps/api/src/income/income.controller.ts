import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { IncomeEvent } from '@sextante/core/fiscal/income';
import type { SessionUser } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createIncomeSchema, type CreateIncomeDto } from './dto/create-income.dto.js';
import { incomeQuerySchema, type IncomeQueryDto } from './dto/income-query.dto.js';
import { updateIncomeSchema, type UpdateIncomeDto } from './dto/update-income.dto.js';
import { DividendResolutionService } from './dividend-resolution.service.js';
import { IncomeService } from './income.service.js';

/** Dividends, interest and rewards of the JWT user. Another user's id yields 404. */
@Controller('income')
@UseGuards(JwtAuthGuard)
export class IncomeController {
  constructor(
    private readonly income: IncomeService,
    private readonly dividends: DividendResolutionService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(incomeQuerySchema)) query: IncomeQueryDto,
  ): Promise<IncomeEvent[]> {
    return this.income.list(user.id, query);
  }

  /** Completes pending dividends with the already cached market data (no external calls). */
  @Post('resolve-dividends')
  @HttpCode(HttpStatus.OK)
  async resolveDividends(@CurrentUser() user: SessionUser): Promise<{ resolved: number }> {
    return { resolved: await this.dividends.resolvePending(user.id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createIncomeSchema)) dto: CreateIncomeDto,
  ): Promise<IncomeEvent> {
    return this.income.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIncomeSchema)) dto: UpdateIncomeDto,
  ): Promise<IncomeEvent> {
    return this.income.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.income.remove(user.id, id);
  }
}
