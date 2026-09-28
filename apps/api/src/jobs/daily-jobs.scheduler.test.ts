import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import type { PricesService, RefreshSummary } from '../prices/prices.service.js';
import { DailyJobsScheduler, DEFAULT_INTRADAY_CRON } from './daily-jobs.scheduler.js';

const SUMMARY: RefreshSummary = { symbols: 1, fetched: 1, missing: [] };

/** Promesa que se resuelve a mano: permite tener un trabajo "en marcha" dentro del test. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(env: Record<string, string> = {}) {
  const jobs = new Map<string, CronJob>();
  const registry = {
    addCronJob: (name: string, job: CronJob) => jobs.set(name, job),
  } as unknown as SchedulerRegistry;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const prices = {
    refreshAll: vi.fn(async () => SUMMARY),
    ensureRecentHistoryForActivePositions: vi.fn(async () => undefined),
  };
  const snapshots = {
    captureAll: vi.fn(async () => undefined),
    backfillAll: vi.fn(async () => undefined),
  };
  const scheduler = new DailyJobsScheduler(
    prices as unknown as PricesService,
    snapshots as unknown as PortfolioSnapshotsService,
    config,
    registry,
  );
  created.push(jobs);
  return { scheduler, jobs, prices, snapshots };
}

const created: Map<string, CronJob>[] = [];

afterEach(() => {
  // Los CronJob reales se arrancan en `onModuleInit`: hay que pararlos para no dejar timers.
  for (const jobs of created.splice(0)) for (const job of jobs.values()) void job.stop();
});

describe('DailyJobsScheduler', () => {
  it('registra el trabajo nocturno y el intradía con su horario por defecto', () => {
    const { scheduler, jobs } = setup();
    scheduler.onModuleInit();

    expect([...jobs.keys()]).toEqual(['daily-portfolio-jobs', 'intraday-price-refresh']);
    expect(jobs.get('intraday-price-refresh')?.cronTime.source).toBe(DEFAULT_INTRADAY_CRON);
  });

  it('PRICE_INTRADAY_CRON=off desactiva solo el intradía', () => {
    const { scheduler, jobs } = setup({ PRICE_INTRADAY_CRON: 'off' });
    scheduler.onModuleInit();

    expect([...jobs.keys()]).toEqual(['daily-portfolio-jobs']);
  });

  it('una variable vacía cae al horario por defecto', () => {
    const { scheduler, jobs } = setup({ PRICE_INTRADAY_CRON: '  ' });
    scheduler.onModuleInit();

    expect(jobs.get('intraday-price-refresh')?.cronTime.source).toBe(DEFAULT_INTRADAY_CRON);
  });

  it('el intradía solo refresca precios: no captura ni rellena snapshots', async () => {
    const { scheduler, prices, snapshots } = setup();

    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
    expect(snapshots.captureAll).not.toHaveBeenCalled();
    expect(snapshots.backfillAll).not.toHaveBeenCalled();
  });

  it('el nocturno refresca, captura y rellena, en ese orden', async () => {
    const { scheduler, prices, snapshots } = setup();

    await scheduler.run();

    const order = [prices.refreshAll, snapshots.captureAll, snapshots.backfillAll].map(
      (fn) => fn.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('si hay un trabajo en marcha, el otro se salta en vez de solaparse', async () => {
    const { scheduler, prices } = setup();
    const gate = deferred();
    prices.refreshAll.mockImplementationOnce(async () => {
      await gate.promise;
      return SUMMARY;
    });

    const nightly = scheduler.run();
    await scheduler.runIntraday();
    gate.resolve();
    await nightly;

    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
  });

  it('libera el cerrojo aunque el refresco falle', async () => {
    const { scheduler, prices } = setup();
    prices.refreshAll.mockRejectedValueOnce(new Error('Yahoo caído'));

    await scheduler.runIntraday();
    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(2);
  });
});
