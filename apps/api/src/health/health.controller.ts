import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { instrumentPrices } from '../db/schema';

/**
 * Horas tras las que se considera rancio el último refresco de precios. El cron corre a
 * diario (22:30), así que 36 h dan margen a una ejecución fallida + reintento del día
 * siguiente sin marcar falsos positivos por findes ni por un arranque tardío.
 */
const STALE_PRICES_AFTER_HOURS = 36;

/**
 * Versión del paquete, leída UNA vez al cargar el módulo. Se lee del `package.json` en vez
 * de importarlo porque `tsconfig.build.json` fija `rootDir: ./src` y un import fuera de ahí
 * no compila. La ruta relativa funciona igual en `dist/health/` (→ `/app/package.json`) que
 * en `src/health/` bajo Vitest. Si algo falla, la salud NO debe romperse por esto.
 */
const VERSION: string = readVersion();

function readVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const version =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined;
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Estado del último refresco de precios (null en todos los campos si aún no hay datos). */
interface PricesHealth {
  /** Fecha (YYYY-MM-DD) del cierre más reciente en caché. */
  lastDate: string | null;
  /** Cuándo se obtuvo el dato más reciente (ISO 8601). */
  lastFetchedAt: string | null;
  /** Horas transcurridas desde esa obtención, con un decimal. */
  ageHours: number | null;
  /** true si supera `STALE_PRICES_AFTER_HOURS`. */
  stale: boolean;
}

interface HealthResponse {
  /** `degraded` = la API funciona, pero algo va mal (hoy: precios rancios). */
  status: 'ok' | 'degraded';
  database: 'up';
  version: string;
  /** Segundos desde el arranque del proceso (entero). */
  uptimeSeconds: number;
  prices: PricesHealth;
  timestamp: string;
}

/**
 * Endpoint de salud. Comprueba de verdad la conectividad con Postgres (SELECT 1), de modo
 * que sirve como *readiness check* para Docker / el reverse proxy, y añade señales de
 * operación: versión desplegada, uptime y frescura de los precios.
 *
 * El código HTTP sigue siendo 200 aunque el estado sea `degraded`: el healthcheck de
 * Compose sale 0/1 según `res.ok`, y unos precios rancios NO justifican reiniciar el
 * contenedor ni sacarlo de balanceo. Solo la BD caída da 503.
 *
 * No expone nada sensible: ni configuración, ni cadenas de conexión, ni datos de usuarios;
 * solo agregados de una tabla de cotizaciones que es caché pública.
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

  /**
   * Una sola consulta agregada que sirve además de prueba de vida de la BD (sustituye al
   * `SELECT 1`: si falla, la conexión está caída igual).
   *
   * Es un seq scan sobre `instrument_prices`, y está bien: la tabla guarda una fila por
   * símbolo y día para los pocos símbolos en uso, así que es diminuta. No se le añade
   * índice a propósito, para no meter cambios de esquema que no hacen falta.
   */
  private async pricesHealth(): Promise<PricesHealth> {
    const [row] = await this.db
      .select({
        lastDate: sql<string | null>`max(${instrumentPrices.date})`,
        lastFetchedAt: sql<string | Date | null>`max(${instrumentPrices.fetchedAt})`,
      })
      .from(instrumentPrices);

    const fetchedAt = row?.lastFetchedAt ? new Date(row.lastFetchedAt) : null;
    if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) {
      // Sin cotizaciones todavía (despliegue recién estrenado, o ninguna posición dada de
      // alta): no hay nada que esté rancio, así que no se degrada el estado.
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
