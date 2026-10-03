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

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { createSavedScenarioSchema, type CreateSavedScenarioDto } from './dto/create-saved-scenario.dto.js';
import { savedScenariosQuerySchema, type SavedScenariosQueryDto } from './dto/saved-scenarios-query.dto.js';
import { updateSavedScenarioSchema, type UpdateSavedScenarioDto } from './dto/update-saved-scenario.dto.js';
import type { SavedScenarioResponse } from '@sextante/core/contracts';
import { SavedScenariosService } from './saved-scenarios.service.js';

/**
 * Saved calculator scenarios. Every endpoint is authenticated and the `userId` always comes
 * from the JWT, never from the body or a query param: a user cannot see, edit or delete another
 * user's scenarios (scoping enforced in the service).
 */
@Controller('scenarios')
@UseGuards(JwtAuthGuard)
export class SavedScenariosController {
  constructor(private readonly scenarios: SavedScenariosService) {}

  /** `?slug=fire-basico` filters by calculator; with no filter, all of the user's scenarios. */
  @Get()
  findAll(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(savedScenariosQuerySchema)) query: SavedScenariosQueryDto,
  ): Promise<SavedScenarioResponse[]> {
    return this.scenarios.findAllByUser(user.id, query.slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createSavedScenarioSchema)) dto: CreateSavedScenarioDto,
  ): Promise<SavedScenarioResponse> {
    return this.scenarios.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSavedScenarioSchema)) dto: UpdateSavedScenarioDto,
  ): Promise<SavedScenarioResponse> {
    return this.scenarios.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.scenarios.remove(user.id, id);
  }
}
