import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccountModule } from './account/account.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './db/database.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { EmailModule } from './email/email.module.js';
import { DailyJobsModule } from './jobs/daily-jobs.module.js';
import { HealthModule } from './health/health.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { OauthModule } from './oauth/oauth.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { PricesModule } from './prices/prices.module.js';
import { ScenariosModule } from './scenarios/scenarios.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite por defecto anti-abuso (los endpoints sensibles ajustan el suyo).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Habilita el cron nocturno de cartera (DailyJobsScheduler).
    ScheduleModule.forRoot(),
    // Global: desacopla PositionsModule de PortfolioModule (que ya importa PositionsModule)
    // sin forwardRef — ver `positions/position-events.ts`.
    EventEmitterModule.forRoot(),
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
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
