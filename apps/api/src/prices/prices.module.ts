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
 * Prices module: source, resolver and search are injected by token, so switching providers means
 * swapping the class here. The daily cron lives in `jobs/DailyJobsModule` because it chains prices
 * and snapshots.
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
  // Reads for valuation and snapshots; history for new positions, imports and the cron. Reused by the MCP tools
  // (`search_instruments` uses the same search as adding a position).
  exports: [PriceReadService, PriceHistoryService, INSTRUMENT_SEARCH],
})
export class PricesModule {}
