import { Global, Module, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase<typeof schema>;

/** La base de datos o una transacción abierta sobre ella: lo que acepta un paso que puede ir dentro de otra. */
export type DatabaseOrTransaction = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cliente `postgres` crudo, para cerrarlo al apagar. */
const PG_CLIENT = Symbol('PG_CLIENT');

/**
 * Cliente `postgres` del pool de la API. Sin timeouts, una conexión colgada o una consulta
 * descontrolada retendrían un hueco del pool (son 10) indefinidamente. `statement_timeout` lo
 * aplica Postgres por sesión y cuenta también la espera de un cerrojo, así que su valor por
 * defecto (30 s) está muy por encima de cualquier consulta normal.
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

/** Módulo global que expone el cliente Drizzle (`DRIZZLE`); no hay `@nestjs/drizzle` oficial, así que es un proveedor propio. */
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
