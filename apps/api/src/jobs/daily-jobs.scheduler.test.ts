import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeConfig } from '../../test/config.js';
import type { AssetClassBackfillService } from '../positions/asset-class-backfill.service.js';
import type { DividendResolutionService } from '../income/dividend-resolution.service.js';
import type { FireAlertsService } from '../notifications/fire-alerts.service.js';
import type { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import type { PriceHistoryService, RefreshSummary } from '../prices/price-history.service.js';
import { DailyJobsScheduler, DEFAULT_INTRADAY_CRON } from './daily-jobs.scheduler.js';
import { firstItem } from '@sextante/core/arrays';
import { stub } from '../../test/factories.js';

const SUMMARY: RefreshSummary = { symbols: 1, fetched: 1, missing: [] };

/** Promesa que se resuelve a mano: permite tener un trabajo "en marcha" dentro del test. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(env: Record<string, string> = {}) {
  const jobs = new Map<string, CronJob>();
  const registry = stub<SchedulerRegistry>({
    addCronJob: (name: string, job: CronJob) => jobs.set(name, job),
  });
  const prices = {
    refreshAll: vi.fn(() => Promise.resolve(SUMMARY)),
    refreshStaleSplits: vi.fn(() => Promise.resolve()),
    ensureHistoryForActivePositions: vi.fn(() => Promise.resolve()),
  };
  const snapshots = {
    captureAll: vi.fn(() => Promise.resolve({ date: '2026-09-28', users: 0, captured: 0, failed: 0 })),
    backfillAll: vi.fn(() => Promise.resolve()),
  };
  const fireAlerts = {
    evaluateAll: vi.fn(() => Promise.resolve({ users: 0, sent: 0, failed: 0 })),
  };
  const dividends = { resolvePending: vi.fn(() => Promise.resolve(0)) };
  const scheduler = new DailyJobsScheduler(
    stub<PriceHistoryService>(prices),
    stub<PortfolioSnapshotsService>(snapshots),
    stub<FireAlertsService>(fireAlerts),
    stub<DividendResolutionService>(dividends),
    stub<AssetClassBackfillService>({ classifyMissing: vi.fn(() => Promise.resolve(0)) }),
    fakeConfig(env),
    registry,
  );
  created.push(jobs);
  return { scheduler, jobs, prices, snapshots, fireAlerts };
}

const created: Map<string, CronJob>[] = [];

afterEach(() => {
  // Los CronJob reales se arrancan en `onModuleInit`: hay que pararlos para no dejar timers.
  for (const jobs of created.splice(0)) for (const job of jobs.values()) void job.stop();
});

describe('DailyJobsScheduler', () => {
  it('la pasada de arranque corre bajo el cerrojo: un refresco intradía simultáneo se omite', async () => {
    const { scheduler, prices } = setup();
    let release: () => void = () => undefined;
    prices.ensureHistoryForActivePositions.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    scheduler.onApplicationBootstrap();
    await scheduler.runIntraday(); // el arranque aún tiene el cerrojo
    expect(prices.refreshAll).not.toHaveBeenCalled();

    release();
    await vi.waitFor(async () => {
      await scheduler.runIntraday();
      expect(prices.refreshAll).toHaveBeenCalled();
    });
  });

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

  it('el intradía solo refresca precios: ni snapshots ni alertas', async () => {
    const { scheduler, prices, snapshots, fireAlerts } = setup();

    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
    expect(snapshots.captureAll).not.toHaveBeenCalled();
    expect(snapshots.backfillAll).not.toHaveBeenCalled();
    expect(fireAlerts.evaluateAll).not.toHaveBeenCalled();
  });

  it('el nocturno refresca, captura, rellena y evalúa las alertas, en ese orden', async () => {
    const { scheduler, prices, snapshots, fireAlerts } = setup();

    await scheduler.run();

    const order = [prices.refreshAll, snapshots.captureAll, snapshots.backfillAll, fireAlerts.evaluateAll].map((fn) =>
      firstItem(fn.mock.invocationCallOrder),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('las alertas evalúan la fecha de la captura, no una recalculada', async () => {
    const { scheduler, fireAlerts } = setup();
    await scheduler.run();
    expect(fireAlerts.evaluateAll).toHaveBeenCalledWith('2026-09-28');
  });

  it('si hay un trabajo en marcha, el intradía se salta en vez de solaparse', async () => {
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

  it('el nocturno NO se descarta si el intradía sigue en marcha: espera y después corre entero', async () => {
    const { scheduler, prices, snapshots } = setup();
    const gate = deferred();
    prices.refreshAll.mockImplementationOnce(async () => {
      await gate.promise;
      return SUMMARY;
    });

    const intraday = scheduler.runIntraday();
    const nightly = scheduler.run();
    await Promise.resolve();
    // Mientras el intradía (colgado de Yahoo) no acaba, el nocturno no ha empezado.
    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
    expect(snapshots.captureAll).not.toHaveBeenCalled();

    gate.resolve();
    await Promise.all([intraday, nightly]);

    expect(prices.refreshAll).toHaveBeenCalledTimes(2);
    expect(snapshots.captureAll).toHaveBeenCalledTimes(1);
  });

  it('el nocturno espera también si el trabajo en marcha falla', async () => {
    const { scheduler, prices, snapshots } = setup();
    const gate = deferred();
    prices.ensureHistoryForActivePositions.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('Yahoo caído');
    });

    scheduler.onApplicationBootstrap();
    const nightly = scheduler.run();
    gate.resolve();
    await nightly;

    expect(snapshots.captureAll).toHaveBeenCalledTimes(1);
  });

  it('libera el cerrojo aunque el refresco falle', async () => {
    const { scheduler, prices } = setup();
    prices.refreshAll.mockRejectedValueOnce(new Error('Yahoo caído'));

    await scheduler.runIntraday();
    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(2);
  });
});
