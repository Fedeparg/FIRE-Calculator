import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { DonationsModule } from './donations/donations.module';
import { EmailModule } from './email/email.module';
import { DailyJobsModule } from './jobs/daily-jobs.module';
import { HealthModule } from './health/health.module';
import { McpModule } from './mcp/mcp.module';
import { OauthModule } from './oauth/oauth.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PositionsModule } from './positions/positions.module';
import { PricesModule } from './prices/prices.module';
import { ScenariosModule } from './scenarios/scenarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite por defecto anti-abuso (los endpoints sensibles ajustan el suyo).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Habilita el cron nocturno de cartera (DailyJobsScheduler).
    ScheduleModule.forRoot(),
    DatabaseModule,
    EmailModule,
    DonationsModule,
    AuthModule,
    HealthModule,
    PositionsModule,
    PricesModule,
    PortfolioModule,
    ScenariosModule,
    DailyJobsModule,
    OauthModule,
    McpModule,
    AccountModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
