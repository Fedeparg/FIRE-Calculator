import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  INSTRUMENT_SEARCH,
  type InstrumentSearchProvider,
  type InstrumentSearchResult,
} from './instrument-search.js';

/**
 * Búsqueda de instrumentos para el alta de posiciones. A diferencia de `/prices` (que lee
 * SIEMPRE de nuestra DB), esta ruta sí consulta la fuente externa en vivo: es un buscador
 * interactivo, no un dato cacheable. Guardado por JWT (solo usuarios autenticados buscan).
 */
@Controller('instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentsController {
  constructor(
    @Inject(INSTRUMENT_SEARCH) private readonly search: InstrumentSearchProvider,
  ) {}

  /** `?q=bitcoin` → lista de instrumentos para elegir, con su símbolo exacto. */
  @Get('search')
  async searchInstruments(
    @Query('q') q?: string,
  ): Promise<{ results: InstrumentSearchResult[] }> {
    const results = await this.search.search(q ?? '');
    return { results };
  }
}
