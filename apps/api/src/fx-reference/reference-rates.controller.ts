import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { ReferenceRates } from '@sextante/core/fiscal/fx-reference';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { referenceRatesQuerySchema, type ReferenceRatesQueryDto } from './dto/reference-rates-query.dto.js';
import { ReferenceRatesService } from './reference-rates.service.js';

/**
 * Tipos de referencia del BCE para el informe fiscal. Con sesión, aunque sean datos públicos:
 * una petición puede acabar en una descarga al BCE y no queremos un disparador anónimo.
 */
@Controller('fx/reference-rates')
@UseGuards(JwtAuthGuard)
export class ReferenceRatesController {
  constructor(private readonly rates: ReferenceRatesService) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async get(
    @Query(new ZodValidationPipe(referenceRatesQuerySchema)) query: ReferenceRatesQueryDto,
  ): Promise<ReferenceRates> {
    return this.rates.getRates(query.currencies, query.from);
  }
}
