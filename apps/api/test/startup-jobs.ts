import type { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';

import { DailyJobsScheduler } from '../src/jobs/daily-jobs.scheduler.js';
import { PortfolioSnapshotsService } from '../src/portfolio/portfolio-snapshots.service.js';
import { PriceHistoryService } from '../src/prices/price-history.service.js';

/**
 * Anula la pasada de arranque de `DailyJobsScheduler` (backfill de precios y snapshots).
 * Llamarlo ANTES de `NestFactory.create` en los tests que arrancan la app completa.
 *
 * Esa pasada se lanza con `void` en `onApplicationBootstrap` y corre en segundo plano justo tras
 * `listen()`: pide históricos y FX a Yahoo (red real, o reintentos con backoff si `fetch` está
 * stubbeado) y lee la BD. Si el primer `resetDb` (TRUNCATE) coincide con ella, Postgres detecta
 * un interbloqueo y el test falla de forma intermitente. Estos tests no dependen de ella.
 *
 * Los spies se deshacen con `vi.restoreAllMocks()`.
 */
export function disableStartupBackfill(): void {
  vi.spyOn(PriceHistoryService.prototype, 'ensureHistoryForActivePositions').mockResolvedValue();
  vi.spyOn(PortfolioSnapshotsService.prototype, 'backfillAll').mockResolvedValue();
}

/** Espera a que el cerrojo del scheduler se libere (la pasada de arranque, ya anulada, termina). */
export async function waitForStartupJobs(app: INestApplication, timeoutMs = 10_000): Promise<void> {
  // `running` es privado: es el cerrojo de los trabajos de precios y no hay otra señal pública.
  const scheduler = app.get<{ running: boolean }>(DailyJobsScheduler);
  const deadline = Date.now() + timeoutMs;
  while (scheduler.running) {
    if (Date.now() > deadline) {
      throw new Error('El trabajo de arranque no terminó a tiempo');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
