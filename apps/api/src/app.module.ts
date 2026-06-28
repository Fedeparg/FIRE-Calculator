import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { PositionsModule } from './positions/positions.module';
import { PricesModule } from './prices/prices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite por defecto anti-abuso (los endpoints sensibles ajustan el suyo).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Habilita el cron de refresco de precios (PricesScheduler).
    ScheduleModule.forRoot(),
    DatabaseModule,
    EmailModule,
    AuthModule,
    HealthModule,
    PositionsModule,
    PricesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
