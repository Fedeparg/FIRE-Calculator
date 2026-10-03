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

/** Módulo global que expone el cliente Drizzle (`DRIZZLE`); no hay `@nestjs/drizzle` oficial, así que es un proveedor propio. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.getOrThrow('DATABASE_URL', { infer: true });
        return postgres(url, { max: 10 });
      },
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
