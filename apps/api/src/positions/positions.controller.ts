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
import { PositionLotsService, type PositionLotResponse } from './position-lots.service.js';
import { updatePositionSchema, type UpdatePositionDto } from './dto/update-position.dto.js';
import { PositionsService, type PositionResponse } from './positions.service.js';

/**
 * Cartera del usuario. Todos los endpoints exigen sesión y el `userId` sale del JWT
 * (`CurrentUser`), nunca del body ni de un query param; el servicio fuerza el scoping.
 * Aislamiento: PATCH/DELETE de una posición ajena o uuid inexistente → 404 (no se
 * distingue, para no revelar ids), id no-uuid → 400, `(símbolo, bróker)` duplicado → 409 con la existente en el body.
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

  /** Todas las operaciones del usuario en orden cronológico (evita una petición por posición en el informe de plusvalías). */
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
