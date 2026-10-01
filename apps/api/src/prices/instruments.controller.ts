import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider, type InstrumentSearchResult } from './instrument-search.js';

/** Búsqueda de instrumentos para el alta. A diferencia de `/prices`, consulta la fuente externa en vivo (buscador interactivo, no cacheable). */
@Controller('instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentsController {
  constructor(@Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider) {}

  @Get('search')
  async searchInstruments(@Query('q') q?: string): Promise<{ results: InstrumentSearchResult[] }> {
    const results = await this.search.search(q ?? '');
    return { results };
  }
}
