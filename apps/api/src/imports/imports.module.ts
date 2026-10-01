import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SESSION_TTL_SECONDS } from '../auth/session.constants.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PricesModule } from '../prices/prices.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

/** Importación de operaciones desde brókers (hoy Trade Republic), sobre los lotes y precios de `PositionsModule`/`PricesModule`. */
@Module({
  imports: [
    PositionsModule,
    PricesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [ImportsController],
  providers: [ImportsService, JwtAuthGuard],
})
export class ImportsModule {}
