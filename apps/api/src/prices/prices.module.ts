import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { INSTRUMENT_SEARCH } from './instrument-search.js';
import { InstrumentsController } from './instruments.controller.js';
import { PRICE_PROVIDER } from './price-provider.interface.js';
import { PricesController } from './prices.controller.js';
import { PricesService } from './prices.service.js';
import { OpenFigiSymbolResolver } from './openfigi-symbol-resolver.js';
import { SYMBOL_RESOLVER } from './symbol-resolver.js';
import { YahooPriceProvider } from './yahoo-price.provider.js';
import { YahooInstrumentSearchProvider } from './yahoo-search.provider.js';

/**
 * Módulo de precios. La fuente de precios (`PRICE_PROVIDER`) y la resolución de símbolos
 * (`SYMBOL_RESOLVER`) se inyectan por token: cambiar de Yahoo a una fuente de pago, o
 * enchufar OpenFIGI, es sustituir la clase aquí sin tocar el resto.
 *
 * El cron diario NO vive aquí: encadena refresco de precios y snapshots de cartera, así que
 * está en `jobs/DailyJobsModule`, por encima de este módulo y del de portfolio.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [PricesController, InstrumentsController],
  providers: [
    PricesService,
    JwtAuthGuard,
    { provide: PRICE_PROVIDER, useClass: YahooPriceProvider },
    { provide: SYMBOL_RESOLVER, useClass: OpenFigiSymbolResolver },
    { provide: INSTRUMENT_SEARCH, useClass: YahooInstrumentSearchProvider },
  ],
  // Exportados para que la valoración de cartera (PortfolioModule, tools MCP) reutilice los
  // precios y tasas FX cacheados, y para que la tool MCP `search_instruments` use el MISMO
  // buscador que el alta de posiciones, sin duplicar el acceso a datos.
  exports: [PricesService, INSTRUMENT_SEARCH],
})
export class PricesModule {}
