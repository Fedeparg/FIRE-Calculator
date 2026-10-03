import type { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';

import { DailyJobsScheduler } from '../src/jobs/daily-jobs.scheduler.js';
import { PortfolioSnapshotsService } from '../src/portfolio/portfolio-snapshots.service.js';
import { PriceHistoryService } from '../src/prices/price-history.service.js';

/**
 * Disables the startup pass of `DailyJobsScheduler` (price and snapshot backfill).
 * Call it BEFORE `NestFactory.create` in the tests that start the full app.
 *
 * That pass is launched with `void` in `onApplicationBootstrap` and runs in the background right
 * after `listen()`: it requests history and FX from Yahoo (real network, or retries with backoff
 * if `fetch` is stubbed) and reads the DB. If the first `resetDb` (TRUNCATE) coincides with it,
 * Postgres detects a deadlock and the test fails intermittently. These tests do not depend on it.
 *
 * The spies are undone with `vi.restoreAllMocks()`.
 */
export function disableStartupBackfill(): void {
  vi.spyOn(PriceHistoryService.prototype, 'ensureHistoryForActivePositions').mockResolvedValue();
  vi.spyOn(PortfolioSnapshotsService.prototype, 'backfillAll').mockResolvedValue();
}

/** Waits for the scheduler lock to be released (the startup pass, already disabled, finishes). */
export async function waitForStartupJobs(app: INestApplication, timeoutMs = 10_000): Promise<void> {
  // `running` is private: it is the lock of the price jobs and there is no other public signal.
  const scheduler = app.get<{ running: boolean }>(DailyJobsScheduler);
  const deadline = Date.now() + timeoutMs;
  while (scheduler.running) {
    if (Date.now() > deadline) {
      throw new Error('The startup job did not finish in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
