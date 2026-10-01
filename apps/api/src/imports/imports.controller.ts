import { Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MAX_IMPORT_BYTES } from '@sextante/core/imports/limits';
import type { ImportPlan, ImportResult } from '@sextante/core/imports/types';
import type { Request } from 'express';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { ImportsService } from './imports.service.js';
import { readCsvBody } from './read-text-body.js';

/**
 * Importación de operaciones desde un bróker. Autenticada como el resto de la cartera (el
 * `userId` sale SIEMPRE del JWT) y con un límite de peticiones propio, más estricto que el
 * global: cada petición reparsea hasta 2 MB y consulta la BD. El CSV viaja como cuerpo
 * `text/csv` (ver `readCsvBody` para la justificación).
 */
@Controller('imports/trade-republic')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Plan de importación: qué se crearía y qué no. NO escribe nada. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@CurrentUser() user: SessionUser, @Req() request: Request): Promise<ImportPlan> {
    return this.imports.preview(user.id, await readCsvBody(request, MAX_IMPORT_BYTES));
  }

  /** Escribe la importación (mismo CSV que la vista previa; sin estado entre ambas). */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: SessionUser, @Req() request: Request): Promise<ImportResult> {
    return this.imports.confirm(user.id, await readCsvBody(request, MAX_IMPORT_BYTES));
  }
}
