import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { instrumentSearchQuerySchema, type InstrumentSearchQueryDto } from './dto/instrument-search-query.dto.js';
import { INSTRUMENT_SEARCH, type InstrumentSearchProvider, type InstrumentSearchResult } from './instrument-search.js';

/**
 * Búsqueda de instrumentos para el alta. A diferencia de `/prices`, consulta la fuente externa en
 * vivo (buscador interactivo); el proveedor cachea unos minutos las consultas repetidas y aquí se
 * limita el ritmo por cliente para que no sea un proxy abierto hacia Yahoo. El frontend hace
 * debounce y degrada un error a "sin resultados".
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
