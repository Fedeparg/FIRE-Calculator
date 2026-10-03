import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
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
import { DataRetentionModule } from './jobs/data-retention.module.js';
import { parseEnv } from './config/env.js';
import { ErrorTranslationFilter } from './common/error-translation.filter.js';
import { FxReferenceModule } from './fx-reference/fx-reference.module.js';
import { IncomeModule } from './income/income.module.js';
import { HealthModule } from './health/health.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { OauthModule } from './oauth/oauth.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { PricesModule } from './prices/prices.module.js';
import { TaxReturnModule } from './tax-return/tax-return.module.js';
import { ScenariosModule } from './scenarios/scenarios.module.js';

@Module({
  imports: [
    // `validate` runs when the module is imported: the environment must already be complete (see `config/env.ts`).
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnv }),
    // Default anti-abuse limit (sensitive endpoints set their own).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Enables the nightly portfolio cron (DailyJobsScheduler).
    ScheduleModule.forRoot(),
    // Global: decouples PositionsModule from PortfolioModule (which already imports PositionsModule)
    // without forwardRef — see `positions/position-events.ts`.
    EventEmitterModule.forRoot(),
    DatabaseModule,
    EmailModule,
    DonationsModule,
    AuthModule,
    HealthModule,
    PositionsModule,
    IncomeModule,
    TaxReturnModule,
    ImportsModule,
    PricesModule,
    FxReferenceModule,
    PortfolioModule,
    ScenariosModule,
    DailyJobsModule,
    DataRetentionModule,
    OauthModule,
    McpModule,
    AccountModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Postgres errors that mean something to the client (FK, unique…) → 4xx/503 instead of 500.
    { provide: APP_FILTER, useClass: ErrorTranslationFilter },
  ],
})
export class AppModule {}
