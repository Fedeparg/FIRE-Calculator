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
import { CombinePositionDto } from './dto/combine-position.dto';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionsService, type PositionResponse } from './positions.service';

/**
 * Cartera del usuario. TODOS los endpoints están autenticados y el `userId` se obtiene
 * SIEMPRE del JWT (`CurrentUser`), nunca del body ni de un query param. Un usuario no
 * puede ver, editar ni borrar las posiciones de otro (scoping forzado en el servicio).
 *
 * Aislamiento entre usuarios — verificado e2e (2026-06-27) contra la API real con dos
 * usuarios A y B:
 *   - POST sin sesión        → 401
 *   - POST con números string → 400 (validación del DTO)
 *   - POST con (símbolo,bróker) ya existente → 409 (con la posición existente en el body)
 *   - GET de B               → NO incluye las posiciones de A (lista vacía)
 *   - PATCH/DELETE de A por B → 403 (no se toca la posición de A)
 *   - id no-uuid             → 400 (ParseUUIDPipe); uuid inexistente → 404
 *   - DELETE de A por A      → 204 (y desaparece de su GET)
 */
@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreatePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: SessionUser): Promise<PositionResponse[]> {
    return this.positions.findAllByUser(user.id);
  }

  /** Combina una nueva compra con una posición existente (media ponderada). */
  @Post(':id/combine')
  combine(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CombinePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.combine(user.id, id, dto);
  }

  /** Edición manual de una posición (cambiar bróker, cantidad, precio medio…). */
  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ): Promise<PositionResponse> {
    return this.positions.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.positions.remove(user.id, id);
  }
}
