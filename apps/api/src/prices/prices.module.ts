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
 * Módulo de precios: fuente, resolver y buscador se inyectan por token, así que cambiar de
 * proveedor es sustituir la clase aquí. El cron diario vive en `jobs/DailyJobsModule` porque
 * encadena precios y snapshots.
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
  // Reutilizados por la valoración de cartera y las tools MCP (`search_instruments` usa el mismo buscador que el alta).
  exports: [PricesService, INSTRUMENT_SEARCH],
})
export class PricesModule {}
