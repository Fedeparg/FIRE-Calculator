import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module.js';
import { instrumentPrices } from '../db/schema.js';

/** El cron es diario: 36 h dan margen a un fallo + reintento sin falsos positivos por findes o arranque tardío. */
const STALE_PRICES_AFTER_HOURS = 36;

/**
 * Versión leída del `package.json` (no importada: `rootDir: ./src` lo impide). La ruta relativa
 * sirve en `dist/health/` y en `src/health/` bajo Vitest. Un fallo no debe romper la salud.
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
  /** `degraded` = la API funciona, pero algo va mal (hoy: precios rancios). */
  status: 'ok' | 'degraded';
  database: 'up';
  version: string;
  uptimeSeconds: number;
  prices: PricesHealth;
  timestamp: string;
}

/**
 * Readiness check (consulta real a Postgres) con versión, uptime y frescura de precios.
 * Devuelve 200 aunque esté `degraded`: el healthcheck de Compose usa `res.ok` y unos precios
 * rancios no justifican reiniciar el contenedor; solo la BD caída da 503.
 * No expone configuración ni datos de usuario, solo agregados de la caché pública de cotizaciones.
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

  /** Consulta agregada que además prueba la BD. Seq scan sin índice a propósito: la tabla es diminuta. */
  private async pricesHealth(): Promise<PricesHealth> {
    const [row] = await this.db
      .select({
        lastDate: sql<string | null>`max(${instrumentPrices.date})`,
        lastFetchedAt: sql<string | Date | null>`max(${instrumentPrices.fetchedAt})`,
      })
      .from(instrumentPrices);

    const fetchedAt = row?.lastFetchedAt ? new Date(row.lastFetchedAt) : null;
    if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) {
      // Sin cotizaciones aún no hay nada rancio.
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
