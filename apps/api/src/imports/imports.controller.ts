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
 * Imports trades from a broker, with a stricter rate limit than the global one: each request
 * re-parses up to 2 MB and queries the database. The CSV is sent as `text/csv` (see `readCsvBody`).
 */
@Controller('imports/trade-republic')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Import plan; writes nothing. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@CurrentUser() user: SessionUser, @Req() request: Request): Promise<ImportPlan> {
    return this.imports.preview(user.id, await readCsvBody(request, MAX_IMPORT_BYTES));
  }

  /** Writes the import (the same CSV as the preview; no state between the two). */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: SessionUser, @Req() request: Request): Promise<ImportResult> {
    return this.imports.confirm(user.id, await readCsvBody(request, MAX_IMPORT_BYTES));
  }
}
