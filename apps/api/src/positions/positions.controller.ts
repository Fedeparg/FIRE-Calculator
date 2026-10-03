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
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { combinePositionSchema, type CombinePositionDto } from './dto/combine-position.dto.js';
import { createPositionSchema, type CreatePositionDto } from './dto/create-position.dto.js';
import { PositionLotsService } from './position-lots.service.js';
import type { PositionLotResponse, PositionResponse } from './position.mapper.js';
import { updatePositionSchema, type UpdatePositionDto } from './dto/update-position.dto.js';
import { PositionsService } from './positions.service.js';

/**
 * The user's portfolio. Every endpoint requires a session and the `userId` comes from the JWT
 * (`CurrentUser`), never from the body or a query param; the service enforces the scoping.
 * Isolation: PATCH/DELETE of a foreign position or a non-existent uuid → 404 (not told apart,
 * so as not to reveal ids), non-uuid id → 400, duplicate `(symbol, broker)` → 409 with the existing one in the body.
 */
@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(
    private readonly positions: PositionsService,
    private readonly lots: PositionLotsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createPositionSchema)) dto: CreatePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: SessionUser): Promise<PositionResponse[]> {
    return this.positions.findAllByUser(user.id);
  }

  /** All of the user's trades in chronological order (avoids one request per position in the capital gains report). */
  @Get('lots')
  findAllLots(@CurrentUser() user: SessionUser): Promise<PositionLotResponse[]> {
    return this.lots.findAllByUser(user.id);
  }

  @Post(':id/combine')
  combine(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(combinePositionSchema)) dto: CombinePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.combine(user.id, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePositionSchema)) dto: UpdatePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.positions.remove(user.id, id);
  }
}
