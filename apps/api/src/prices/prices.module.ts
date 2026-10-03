import { Module } from '@nestjs/common';

import { INSTRUMENT_SEARCH } from './instrument-search.js';
import { InstrumentsController } from './instruments.controller.js';
import { PRICE_PROVIDER } from './price-provider.interface.js';
import { PricesController } from './prices.controller.js';
import { PriceHistoryService } from './price-history.service.js';
import { PriceReadService } from './price-read.service.js';
import { OpenFigiSymbolResolver } from './openfigi-symbol-resolver.js';
import { SYMBOL_RESOLVER } from './symbol-resolver.js';
import { YahooPriceProvider } from './yahoo-price.provider.js';
import { YahooInstrumentSearchProvider } from './yahoo-search.provider.js';
import { SessionModule } from '../auth/session.module.js';

/**
 * Módulo de precios: fuente, resolver y buscador se inyectan por token, así que cambiar de
 * proveedor es sustituir la clase aquí. El cron diario vive en `jobs/DailyJobsModule` porque
 * encadena precios y snapshots.
 */
@Module({
  imports: [SessionModule],
  controllers: [PricesController, InstrumentsController],
  providers: [
    PriceReadService,
    PriceHistoryService,
    { provide: PRICE_PROVIDER, useClass: YahooPriceProvider },
    { provide: SYMBOL_RESOLVER, useClass: OpenFigiSymbolResolver },
    { provide: INSTRUMENT_SEARCH, useClass: YahooInstrumentSearchProvider },
  ],
  // Lecturas para la valoración y los snapshots; el histórico para altas, importación y cron. Reutilizados por las tools MCP (`search_instruments` usa el mismo buscador que el alta).
  exports: [PriceReadService, PriceHistoryService, INSTRUMENT_SEARCH],
})
export class PricesModule {}
