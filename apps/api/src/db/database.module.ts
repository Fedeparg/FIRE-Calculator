import { Global, Module, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/** Token de inyección para el cliente Drizzle. */
export const DRIZZLE = Symbol('DRIZZLE');

/** Tipo del cliente Drizzle ya tipado con nuestro esquema. */
export type Database = PostgresJsDatabase<typeof schema>;

/** Token interno para el cliente `postgres` crudo (para poder cerrarlo al apagar). */
const PG_CLIENT = Symbol('PG_CLIENT');

/**
 * Módulo global de base de datos. Expone un cliente Drizzle (`DRIZZLE`) inyectable
 * en cualquier servicio. No existe un paquete oficial `@nestjs/drizzle`: lo
 * cableamos como proveedor propio, que es el patrón estándar.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return postgres(url, { max: 10 });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: ReturnType<typeof postgres>): Database =>
        drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_CLIENT) private readonly client: ReturnType<typeof postgres>) {}

  /** Cierra limpiamente el pool de conexiones al apagar la app. */
  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
