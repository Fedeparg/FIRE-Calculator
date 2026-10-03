import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import { fakeConfig } from '../../test/config.js';
import type { AssetClassBackfillService } from '../positions/asset-class-backfill.service.js';
import type { DividendResolutionService } from '../income/dividend-resolution.service.js';
import type { FireAlertsService } from '../notifications/fire-alerts.service.js';
import type { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import type { PriceHistoryService, RefreshSummary } from '../prices/price-history.service.js';
import { DailyJobsScheduler, DEFAULT_INTRADAY_CRON } from './daily-jobs.scheduler.js';
import { stub } from '../../test/factories.js';

const SUMMARY: RefreshSummary = { symbols: 1, fetched: 1, missing: [] };

/** Manually resolved promise: lets the test keep a job "running". */
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
  // The real CronJobs start in `onModuleInit`: stop them so no timers are left behind.
  for (const jobs of created.splice(0)) for (const job of jobs.values()) void job.stop();
});

describe('DailyJobsScheduler', () => {
  it('runs the startup pass under the lock: a concurrent intraday refresh is skipped', async () => {
    const { scheduler, prices } = setup();
    let release: () => void = () => undefined;
    prices.ensureHistoryForActivePositions.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    scheduler.onApplicationBootstrap();
    await scheduler.runIntraday(); // the startup pass still holds the lock
    expect(prices.refreshAll).not.toHaveBeenCalled();

    release();
    await vi.waitFor(async () => {
      await scheduler.runIntraday();
      expect(prices.refreshAll).toHaveBeenCalled();
    });
  });

  it('registers the nightly and intraday jobs with their default schedule', () => {
    const { scheduler, jobs } = setup();
    scheduler.onModuleInit();

    expect([...jobs.keys()]).toEqual(['daily-portfolio-jobs', 'intraday-price-refresh']);
    expect(jobs.get('intraday-price-refresh')?.cronTime.source).toBe(DEFAULT_INTRADAY_CRON);
  });

  it('PRICE_INTRADAY_CRON=off disables only the intraday job', () => {
    const { scheduler, jobs } = setup({ PRICE_INTRADAY_CRON: 'off' });
    scheduler.onModuleInit();

    expect([...jobs.keys()]).toEqual(['daily-portfolio-jobs']);
  });

  it('falls back to the default schedule when the variable is blank', () => {
    const { scheduler, jobs } = setup({ PRICE_INTRADAY_CRON: '  ' });
    scheduler.onModuleInit();

    expect(jobs.get('intraday-price-refresh')?.cronTime.source).toBe(DEFAULT_INTRADAY_CRON);
  });

  it('the intraday job only refreshes prices: no snapshots or alerts', async () => {
    const { scheduler, prices, snapshots, fireAlerts } = setup();

    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
    expect(snapshots.captureAll).not.toHaveBeenCalled();
    expect(snapshots.backfillAll).not.toHaveBeenCalled();
    expect(fireAlerts.evaluateAll).not.toHaveBeenCalled();
  });

  it('the nightly job refreshes, captures, backfills and evaluates alerts, in that order', async () => {
    const { scheduler, prices, snapshots, fireAlerts } = setup();

    await scheduler.run();

    const order = [prices.refreshAll, snapshots.captureAll, snapshots.backfillAll, fireAlerts.evaluateAll].map((fn) =>
      firstItem(fn.mock.invocationCallOrder),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the alerts evaluate the capture date, not a recomputed one', async () => {
    const { scheduler, fireAlerts } = setup();
    await scheduler.run();
    expect(fireAlerts.evaluateAll).toHaveBeenCalledWith('2026-09-28');
  });

  it('skips the intraday job instead of overlapping a running job', async () => {
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

  it('does NOT drop the nightly job while the intraday one is running: it waits and then runs fully', async () => {
    const { scheduler, prices, snapshots } = setup();
    const gate = deferred();
    prices.refreshAll.mockImplementationOnce(async () => {
      await gate.promise;
      return SUMMARY;
    });

    const intraday = scheduler.runIntraday();
    const nightly = scheduler.run();
    await Promise.resolve();
    // While the intraday job (stuck on Yahoo) has not finished, the nightly one has not started.
    expect(prices.refreshAll).toHaveBeenCalledTimes(1);
    expect(snapshots.captureAll).not.toHaveBeenCalled();

    gate.resolve();
    await Promise.all([intraday, nightly]);

    expect(prices.refreshAll).toHaveBeenCalledTimes(2);
    expect(snapshots.captureAll).toHaveBeenCalledTimes(1);
  });

  it('the nightly job also waits when the running job fails', async () => {
    const { scheduler, prices, snapshots } = setup();
    const gate = deferred();
    prices.ensureHistoryForActivePositions.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('Yahoo down');
    });

    scheduler.onApplicationBootstrap();
    const nightly = scheduler.run();
    gate.resolve();
    await nightly;

    expect(snapshots.captureAll).toHaveBeenCalledTimes(1);
  });

  it('releases the lock even if the refresh fails', async () => {
    const { scheduler, prices } = setup();
    prices.refreshAll.mockRejectedValueOnce(new Error('Yahoo down'));

    await scheduler.runIntraday();
    await scheduler.runIntraday();

    expect(prices.refreshAll).toHaveBeenCalledTimes(2);
  });
});
