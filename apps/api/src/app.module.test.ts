import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it, inject, vi } from 'vitest';

import { POSITION_CREATED_EVENT } from './positions/position-events.js';
import { PortfolioSnapshotsService } from './portfolio/portfolio-snapshots.service.js';

/**
 * `AppModule` is imported lazily: `ConfigModule.forRoot({ validate })` validates the environment when
 * the module is evaluated, and these tests set theirs in `beforeAll`, that is, after the imports.
 */
const loadAppModule = async () => (await import('./app.module.js')).AppModule;

/**
 * Checks that the whole application STARTS: that the dependency injection graph resolves and
 * that the startup hooks (registering the daily cron and the backfill in
 * `DailyJobsScheduler.onApplicationBootstrap`) do not blow up.
 *
 * It is not a behaviour test: it is the net that catches failures that only show up at
 * startup (a provider not exported by its module, a circular dependency between modules,
 * an unregistered token) and that no unit test sees, because each one instantiates its
 * services by hand. With the daily job chaining `PricesModule` and `PortfolioModule`, that
 * class of failure became easy to introduce.
 *
 * It uses an application context (no HTTP server) so it does not take up ports, and closes it
 * at the end, which stops the registered crons. `fetch` is replaced with a stub: since
 * `DailyJobsScheduler.onApplicationBootstrap` backfills the price history without waiting for
 * `listen()`, without it this test would fire a real Yahoo Finance call on every startup.
 */
describe('AppModule (application startup)', () => {
  const original = { ...process.env };
  const realFetch = global.fetch;

  beforeAll(() => {
    // Minimal environment to start: the ephemeral Testcontainers DB and the JWT secret.
    // Set here, rather than inherited from the local `.env`, so the test behaves the same in CI.
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_SECRET = 'test-secret-for-the-dependency-graph';
    process.env.EMAIL_TRANSPORT = 'dev';
    process.env.EMAIL_FROM = 'Sextante <no-reply@example.test>';
    // Base of the OAuth issuer (`OAuthUrls` requires it); any valid origin works here.
    process.env.APP_URL = 'https://sextante.example.test';
    // A cron that never fires during the test (29 February of a non-leap year does not exist;
    // a distant date is enough): all that matters is that it REGISTERS without error.
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
    // The intraday cron fires every half hour: when it coincided with a test, its read deadlocked
    // with the TRUNCATE in `resetDb` (a failure that depended on the time the suite ran).
    process.env.PRICE_INTRADAY_CRON = 'off';
  });

  afterAll(() => {
    // Not in `afterEach`: `onApplicationBootstrap` fires `bootstrapBackfill()` without awaiting
    // it (`void`), so after `app.close()` a DB query may still be in flight that calls `fetch`
    // when it resolves. Restoring it before then would reopen the window to a real Yahoo call
    // that this test exists to eliminate.
    global.fetch = realFetch;
    process.env = original;
  });

  it('resolves every module and provider of the application', async () => {
    // Without a stub, `YahooPriceProvider.fetchChart` would hit the real network as soon as the
    // startup backfill fires (see the `describe` comment). Simply rejecting is enough: the
    // provider itself is already fault-tolerant (see `price-provider.interface.ts`).
    global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in this test'));

    // `abortOnError: false`: by default Nest calls `process.exit(1)` on a startup failure,
    // which would kill the Vitest worker without saying why. This way it throws visibly.
    const app = await NestFactory.createApplicationContext(await loadAppModule(), {
      abortOnError: false,
      logger: false,
    });

    // Had the graph a cycle or a missing `exports`, the previous line would have thrown.
    expect(app).toBeDefined();
    await app.close();
  });

  it('the position.created event DOES reach @OnEvent under the real Nest startup', async () => {
    // Unlike the `PortfolioSnapshotsService`/`PositionsService` tests (which instantiate the
    // services with `new` and therefore never go through Nest's `DiscoveryService`), here the
    // `EventEmitter2` and the `@OnEvent`-decorated listener come from the SAME `AppModule`
    // container: it is the only proof that the event wiring (`EventEmitterModule.forRoot()` +
    // `@OnEvent(POSITION_CREATED_EVENT)`, see `positions/position-events.ts`) really works, not
    // just that the method body works when called by hand.
    global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in this test'));

    const app = await NestFactory.createApplicationContext(await loadAppModule(), {
      abortOnError: false,
      logger: false,
    });

    const snapshots = app.get(PortfolioSnapshotsService);
    const backfillUser = vi.spyOn(snapshots, 'backfillUser').mockResolvedValue(undefined);
    const emitter = app.get(EventEmitter2);

    await emitter.emitAsync(POSITION_CREATED_EVENT, { userId: 'test-event' });

    expect(backfillUser).toHaveBeenCalledWith('test-event');
    await app.close();
  });
});
