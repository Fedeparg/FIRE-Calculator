import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { AssetClassBackfillService } from '../positions/asset-class-backfill.service.js';
import { DividendResolutionService } from '../income/dividend-resolution.service.js';
import { FireAlertsService } from '../notifications/fire-alerts.service.js';
import { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import { PriceHistoryService } from '../prices/price-history.service.js';
import { scheduleFromEnv, TIME_ZONE } from '../common/schedule.js';
import { errorMessage } from '../common/errors.js';

/** One step of a job: name (for the error log) and body. */
type JobStep = readonly [name: string, run: () => Promise<unknown>];

/** Default: every day at 22:30 Madrid time. 6-field format (s m h D M W). */
export const DEFAULT_CRON = '0 30 22 * * *';
/** Intraday: on the hour from 9:00 to 21:00 (Madrid), Monday to Friday; covers Europe and most of the US and ends before the nightly job. */
export const DEFAULT_INTRADAY_CRON = '0 0 9-21 * * 1-5';
/** `PRICE_INTRADAY_CRON` value that disables the intraday refresh. */
export const INTRADAY_OFF = 'off';

/**
 * Nightly job (22:30 Madrid, `PRICE_REFRESH_CRON`; European and US exchanges are already closed),
 * every day: at weekends stocks return the last close, crypto keeps moving and the daily snapshot
 * must not have gaps. Steps, in order:
 *   1. Price refresh (symbols in use and FX pairs).
 *   2. Snapshot of every portfolio. Runs after 1: capturing earlier would store yesterday's close under today's date.
 *   3. Self-healing history rebuild. It only reads prices from the cache (it does not re-download
 *      5 years every night); it repairs rebuilt positions whose history was only half fetched.
 *   4. FIRE milestone alerts (opt-in) on the snapshot just captured.
 *
 * The intraday job (`PRICE_INTRADAY_CRON`, `off` disables it) only updates prices and FX; the
 * nightly job leaves the day's row with the close. They share an in-memory lock so they don't
 * duplicate requests to Yahoo: the intraday job (and the startup pass) is skipped if another job is
 * running, but the NIGHTLY one waits for it to finish, because skipping it would leave the day
 * without a snapshot. The lock is per process, not distributed: that is fine because the API runs as
 * a single replica. A `pg_try_advisory_lock` would work with several replicas, but it is
 * SESSION-scoped: it requires holding a pool connection for the whole job and polling for the
 * nightly job's wait; not worth it while there is a single instance.
 *
 * It lives here and not in `prices/` because the snapshot needs `PortfolioModule`, which depends on
 * `PricesModule`: hanging it off `prices/` would create a cycle that only `forwardRef` can break.
 */
@Injectable()
export class DailyJobsScheduler implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DailyJobsScheduler.name);
  /** Running job (never rejects), or null if the lock is free. */
  private current: Promise<void> | null = null;

  constructor(
    private readonly prices: PriceHistoryService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly fireAlerts: FireAlertsService,
    private readonly dividends: DividendResolutionService,
    private readonly assetClasses: AssetClassBackfillService,
    private readonly config: ConfigService<Env, true>,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const cronTime = scheduleFromEnv(this.registry, {
      name: 'daily-portfolio-jobs',
      cronTime: this.config.get('PRICE_REFRESH_CRON', { infer: true }),
      defaultCron: DEFAULT_CRON,
      handler: () => void this.run(),
    });
    this.logger.log(`Daily portfolio job scheduled: "${cronTime}" (${TIME_ZONE})`);

    const intradayTime = scheduleFromEnv(this.registry, {
      name: 'intraday-price-refresh',
      cronTime: this.config.get('PRICE_INTRADAY_CRON', { infer: true }),
      defaultCron: DEFAULT_INTRADAY_CRON,
      handler: () => void this.runIntraday(),
      off: INTRADAY_OFF,
    });
    if (intradayTime === undefined) {
      this.logger.log('Intraday price refresh disabled (PRICE_INTRADAY_CRON=off)');
      return;
    }
    this.logger.log(`Intraday price refresh scheduled: "${intradayTime}" (${TIME_ZONE})`);
  }

  /**
   * Startup pass: repairs gaps for existing users without waiting for the cron. It goes here and
   * not in `onModuleInit` (it depends on the order between `PricesModule` and `PortfolioModule`),
   * without blocking `listen()` and tolerant to failures.
   */
  onApplicationBootstrap(): void {
    // Same lock: it may request dozens of histories from Yahoo and must not overlap a refresh.
    void this.exclusive('startup', () => this.bootstrapBackfill());
  }

  private async bootstrapBackfill(): Promise<void> {
    await this.steps([
      ['Price history backfill at startup', () => this.prices.ensureHistoryForActivePositions()],
      ['Snapshot backfill at startup', () => this.snapshots.backfillAll()],
      ['Position classification', () => this.assetClasses.classifyMissing()],
    ]);
  }

  /**
   * Runs the steps in order, each with its own `try/catch`: a failing step is logged with its name
   * and does not stop the next ones (with the source down, the snapshot is still stored).
   */
  private async steps(steps: readonly JobStep[]): Promise<void> {
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (error) {
        this.logger.error(`${name} failed: ${errorMessage(error)}`);
      }
    }
  }

  /** Steps with errors caught separately: with the source down the snapshot is still stored (yesterday's prices beat a gap). */
  async run(): Promise<void> {
    await this.exclusive('nightly', () => this.runNightly(), 'wait');
  }

  async runIntraday(): Promise<void> {
    await this.exclusive('intraday', () =>
      this.steps([
        [
          'Intraday price refresh',
          async () => {
            const summary = await this.prices.refreshAll();
            this.logger.log(`Intraday refresh: ${summary.fetched}/${summary.symbols} symbols`);
          },
        ],
      ]),
    );
  }

  /**
   * Runs `task` under the lock. If another job is running, `skip` drops it (and logs it) and `wait`
   * waits for it to finish before starting. The lock is always released.
   */
  private async exclusive(label: string, task: () => Promise<void>, onBusy: 'skip' | 'wait' = 'skip'): Promise<void> {
    while (this.current) {
      if (onBusy === 'skip') {
        this.logger.warn(`Skipped the ${label} job: another price job is running`);
        return;
      }
      this.logger.warn(`The ${label} job is waiting: another price job is running`);
      await this.current;
    }
    const running = task();
    this.current = running.then(
      () => undefined,
      () => undefined,
    );
    try {
      await running;
    } finally {
      this.current = null;
    }
  }

  private async runNightly(): Promise<void> {
    // The alerts evaluate this specific snapshot (see `evaluateAll`).
    let captureDate: string | undefined;
    await this.steps([
      ['Price refresh', () => this.prices.refreshAll()],
      [
        'Snapshot capture',
        async () => {
          captureDate = (await this.snapshots.captureAll()).date;
        },
      ],
      ['Snapshot backfill', () => this.snapshots.backfillAll()],
      [
        'FIRE alert evaluation',
        async () => {
          const alerts = await this.fireAlerts.evaluateAll(captureDate);
          if (alerts.users > 0) {
            this.logger.log(`FIRE alerts: ${alerts.sent} sent, ${alerts.failed} failed, ${alerts.users} users`);
          }
        },
      ],
      // Splits of the symbols in use whose mark is older than 7 days (1 call per symbol and week).
      // Runs after the alerts: the snapshot and the notifications must not wait for Yahoo.
      ['Split refresh', () => this.prices.refreshStaleSplits()],
      // With the market dividends just cached (they come with the splits), the pending payments are completed.
      ['Dividend resolution', () => this.dividends.resolvePending()],
      ['Position classification', () => this.assetClasses.classifyMissing()],
    ]);
  }
}
