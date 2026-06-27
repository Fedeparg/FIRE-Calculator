import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';

type HealthResponse = {
  status: 'ok';
  database: 'up';
  timestamp: string;
};

/**
 * Endpoint de salud. Comprueba de verdad la conectividad con Postgres (SELECT 1),
 * de modo que sirve como *readiness check* para Docker / el reverse proxy.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }

    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
