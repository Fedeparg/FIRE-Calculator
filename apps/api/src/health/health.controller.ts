import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { instrumentPrices } from '../db/schema.js';

/** The cron is daily: 36 h leave room for a failure + retry without false positives on weekends or late starts. */
const STALE_PRICES_AFTER_HOURS = 36;

/**
 * Version read from `package.json` (not imported: `rootDir: ./src` forbids it). The relative path
 * works from `dist/health/` and from `src/health/` under Vitest. A failure must not break the health check.
 */
const VERSION: string = readVersion();

function readVersion(): string {
  try {
    const raw = readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const version =
      typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

interface PricesHealth {
  lastDate: string | null;
  lastFetchedAt: string | null;
  ageHours: number | null;
  stale: boolean;
}

interface HealthResponse {
  /** `degraded` = the API works, but something is wrong (today: stale prices). */
  status: 'ok' | 'degraded';
  database: 'up';
  version: string;
  uptimeSeconds: number;
  prices: PricesHealth;
  timestamp: string;
}

/**
 * Readiness check (a real query to Postgres) with version, uptime and price freshness.
 * Returns 200 even when `degraded`: the Compose healthcheck uses `res.ok` and stale prices do not
 * justify restarting the container; only a database outage returns 503.
 * Exposes no configuration or user data, only aggregates of the public quote cache.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthResponse> {
    let prices: PricesHealth;
    try {
      prices = await this.pricesHealth();
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }

    return {
      status: prices.stale ? 'degraded' : 'ok',
      database: 'up',
      version: VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      prices,
      timestamp: new Date().toISOString(),
    };
  }

  /** Aggregate query that also probes the database. Seq scan without an index on purpose: the table is tiny. */
  private async pricesHealth(): Promise<PricesHealth> {
    const [row] = await this.db
      .select({
        lastDate: sql<string | null>`max(${instrumentPrices.date})`,
        lastFetchedAt: sql<string | Date | null>`max(${instrumentPrices.fetchedAt})`,
      })
      .from(instrumentPrices);

    const fetchedAt = row?.lastFetchedAt ? new Date(row.lastFetchedAt) : null;
    if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) {
      // With no quotes yet, nothing can be stale.
      return { lastDate: row?.lastDate ?? null, lastFetchedAt: null, ageHours: null, stale: false };
    }

    const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000;
    return {
      lastDate: row?.lastDate ?? null,
      lastFetchedAt: fetchedAt.toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      stale: ageHours > STALE_PRICES_AFTER_HOURS,
    };
  }
}
