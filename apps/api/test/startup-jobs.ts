import type { INestApplication } from '@nestjs/common';

import { DailyJobsScheduler } from '../src/jobs/daily-jobs.scheduler.js';

/**
 * Espera a que termine la pasada de arranque de `DailyJobsScheduler` (backfill de precios y
 * snapshots, lanzada con `void` en `onApplicationBootstrap`). Corre en segundo plano contra la
 * BD justo tras `listen()`: si el primer `resetDb` (TRUNCATE) coincide con ella, Postgres
 * detecta un interbloqueo y el test falla de forma intermitente. Llamarlo tras arrancar la app
 * deja la BD quieta antes de empezar.
 */
export async function waitForStartupJobs(app: INestApplication, timeoutMs = 10_000): Promise<void> {
  // `running` es privado: es el cerrojo del trabajo de arranque y no hay otra señal pública.
  const scheduler = app.get<{ running: boolean }>(DailyJobsScheduler);
  const deadline = Date.now() + timeoutMs;
  while (scheduler.running) {
    if (Date.now() > deadline) {
      throw new Error('El trabajo de arranque no terminó a tiempo');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
