import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { instrumentSearchQuerySchema, type InstrumentSearchQueryDto } from './dto/instrument-search-query.dto.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider, type InstrumentSearchResult } from './instrument-search.js';

/**
 * Instrument search for adding a position. Unlike `/prices`, it queries the external source live
 * (interactive search box); the provider caches repeated queries for a few minutes and this
 * endpoint is rate limited per client so it is not an open proxy to Yahoo. The frontend debounces
 * and degrades an error to "no results".
 */
@Controller('instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentsController {
  constructor(@Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider) {}

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async searchInstruments(
    @Query(new ZodValidationPipe(instrumentSearchQuerySchema)) query: InstrumentSearchQueryDto,
  ): Promise<{ results: InstrumentSearchResult[] }> {
    const results = await this.search.search(query.q);
    return { results };
  }
}
