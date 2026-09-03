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

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { CreateSavedScenarioDto } from './dto/create-saved-scenario.dto';
import { SavedScenariosQueryDto } from './dto/saved-scenarios-query.dto';
import { UpdateSavedScenarioDto } from './dto/update-saved-scenario.dto';
import {
  SavedScenariosService,
  type SavedScenarioResponse,
} from './saved-scenarios.service';

/**
 * Escenarios guardados de calculadora. TODOS los endpoints están autenticados y el `userId`
 * sale SIEMPRE del JWT, nunca del body ni de un query param: un usuario no puede ver, editar
 * ni borrar los escenarios de otro (scoping forzado en el servicio).
 */
@Controller('scenarios')
@UseGuards(JwtAuthGuard)
export class SavedScenariosController {
  constructor(private readonly scenarios: SavedScenariosService) {}

  /** `?slug=fire-basico` filtra por calculadora; sin filtro, todos los del usuario. */
  @Get()
  findAll(
    @CurrentUser() user: SessionUser,
    @Query() query: SavedScenariosQueryDto,
  ): Promise<SavedScenarioResponse[]> {
    return this.scenarios.findAllByUser(user.id, query.slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateSavedScenarioDto,
  ): Promise<SavedScenarioResponse> {
    return this.scenarios.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedScenarioDto,
  ): Promise<SavedScenarioResponse> {
    return this.scenarios.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.scenarios.remove(user.id, id);
  }
}
