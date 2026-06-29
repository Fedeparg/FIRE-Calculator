import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SESSION_TTL_SECONDS } from '../auth/session.constants';
import { INSTRUMENT_SEARCH } from './instrument-search';
import { InstrumentsController } from './instruments.controller';
import { PRICE_PROVIDER } from './price-provider.interface';
import { PricesController } from './prices.controller';
import { PricesScheduler } from './prices.scheduler';
import { PricesService } from './prices.service';
import { OpenFigiSymbolResolver } from './openfigi-symbol-resolver';
import { SYMBOL_RESOLVER } from './symbol-resolver';
import { YahooPriceProvider } from './yahoo-price.provider';
import { YahooInstrumentSearchProvider } from './yahoo-search.provider';

/**
 * Módulo de precios. La fuente de precios (`PRICE_PROVIDER`) y la resolución de símbolos
 * (`SYMBOL_RESOLVER`) se inyectan por token: cambiar de Yahoo a una fuente de pago, o
 * enchufar OpenFIGI, es sustituir la clase aquí sin tocar el resto.
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
    PricesScheduler,
    JwtAuthGuard,
    { provide: PRICE_PROVIDER, useClass: YahooPriceProvider },
    { provide: SYMBOL_RESOLVER, useClass: OpenFigiSymbolResolver },
    { provide: INSTRUMENT_SEARCH, useClass: YahooInstrumentSearchProvider },
  ],
  // Exportado para que la valoración de cartera (PortfolioModule, tools MCP) reutilice los
  // precios y tasas FX cacheados sin duplicar el acceso a datos.
  exports: [PricesService],
})
export class PricesModule {}
