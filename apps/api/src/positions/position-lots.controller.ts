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

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { CreatePositionLotDto } from './dto/create-position-lot.dto';
import { UpdatePositionLotDto } from './dto/update-position-lot.dto';
import { PositionLotsService, type PositionLotResponse } from './position-lots.service';

/**
 * Lotes (compras y ventas) de una posición. Rutas ANIDADAS bajo la posición a propósito:
 * el aislamiento se resuelve una sola vez comprobando que la posición es del usuario del JWT
 * (404 si no existe, 403 si es de otro), y el lote se busca SIEMPRE dentro de esa posición,
 * así que un id de lote ajeno no puede colarse por la ruta (sería 404).
 *
 * Igual que en `PositionsController`, el `userId` sale del JWT, nunca del body ni de la URL.
 * Cada mutación reescribe `positions.quantity`/`avgPrice` en la misma transacción.
 */
@Controller('positions/:positionId/lots')
@UseGuards(JwtAuthGuard)
export class PositionLotsController {
  constructor(private readonly lots: PositionLotsService) {}

  /** Histórico de operaciones de la posición, en orden cronológico. */
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
    @Body() dto: CreatePositionLotDto,
  ): Promise<PositionLotResponse> {
    return this.lots.create(user.id, positionId, dto);
  }

  @Patch(':lotId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: UpdatePositionLotDto,
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
