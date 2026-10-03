import { Global, Module, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase<typeof schema>;

/** The database or an open transaction on it: what a step that may run inside another one accepts. */
export type DatabaseOrTransaction = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Raw `postgres` client, so it can be closed on shutdown. */
const PG_CLIENT = Symbol('PG_CLIENT');

/**
 * `postgres` client for the API pool. Without timeouts, a hung connection or a runaway query
 * would hold one of the pool's slots (there are 10) indefinitely. Postgres applies
 * `statement_timeout` per session and it also counts time spent waiting for a lock, so its
 * default (30 s) is well above any normal query.
 */
export function createPgClient(config: ConfigService<Env, true>): ReturnType<typeof postgres> {
  const url = config.getOrThrow('DATABASE_URL', { infer: true });
  const statementTimeoutMs = config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true });
  return postgres(url, {
    max: 10,
    idle_timeout: config.get('DB_IDLE_TIMEOUT_SECONDS', { infer: true }) || undefined,
    connect_timeout: config.get('DB_CONNECT_TIMEOUT_SECONDS', { infer: true }),
    connection: statementTimeoutMs > 0 ? { statement_timeout: statementTimeoutMs } : {},
  });
}

/** Global module exposing the Drizzle client (`DRIZZLE`); there is no official `@nestjs/drizzle`, so it is a custom provider. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: createPgClient,
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: ReturnType<typeof postgres>): Database => drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_CLIENT) private readonly client: ReturnType<typeof postgres>) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
