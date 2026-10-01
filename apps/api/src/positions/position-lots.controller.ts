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
import { createPositionLotSchema, type CreatePositionLotDto } from './dto/create-position-lot.dto.js';
import { updatePositionLotSchema, type UpdatePositionLotDto } from './dto/update-position-lot.dto.js';
import { PositionLotsService, type PositionLotResponse } from './position-lots.service.js';

/**
 * Lotes de una posición, anidados a propósito: el aislamiento se resuelve una vez comprobando
 * que la posición es del usuario del JWT (404) y el lote se busca dentro de ella, así que
 * un id de lote ajeno da 404. Cada mutación reescribe `positions.quantity/avgPrice` en la misma transacción.
 */
@Controller('positions/:positionId/lots')
@UseGuards(JwtAuthGuard)
export class PositionLotsController {
  constructor(private readonly lots: PositionLotsService) {}

  @Get()
  findAll(
    @CurrentUser() user: SessionUser,
    @Param('positionId', ParseUUIDPipe) positionId: string,
  ): Promise<PositionLotResponse[]> {
    return this.lots.listByPosition(user.id, positionId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Body(new ZodValidationPipe(createPositionLotSchema)) dto: CreatePositionLotDto,
  ): Promise<PositionLotResponse> {
    return this.lots.create(user.id, positionId, dto);
  }

  @Patch(':lotId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body(new ZodValidationPipe(updatePositionLotSchema)) dto: UpdatePositionLotDto,
  ): Promise<PositionLotResponse> {
    return this.lots.update(user.id, positionId, lotId, dto);
  }

  @Delete(':lotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
  ): Promise<void> {
    return this.lots.remove(user.id, positionId, lotId);
  }
}
