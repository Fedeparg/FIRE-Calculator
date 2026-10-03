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

/** Paso de un trabajo: nombre (para el log de error) y cuerpo. */
type JobStep = readonly [name: string, run: () => Promise<unknown>];

/** Por defecto: cada día a las 22:30 hora de Madrid. Formato de 6 campos (s m h D M W). */
export const DEFAULT_CRON = '0 30 22 * * *';
/** Intradía: en punto de 9:00 a 21:00 (Madrid), lunes a viernes; cubre Europa y casi todo EE. UU. y acaba antes del nocturno. */
export const DEFAULT_INTRADAY_CRON = '0 0 9-21 * * 1-5';
/** Valor de `PRICE_INTRADAY_CRON` que desactiva el intradía. */
export const INTRADAY_OFF = 'off';

/**
 * Trabajo nocturno (22:30 Madrid, `PRICE_REFRESH_CRON`; ya cerradas las bolsas europea y
 * estadounidense), todos los días: los findes las acciones devuelven el último cierre, la cripto
 * se actualiza y el snapshot diario no puede tener huecos. Pasos, en orden:
 *   1. Refresco de precios (símbolos en uso y pares FX).
 *   2. Snapshot de cada cartera. Va tras el 1: capturar antes guardaría el cierre de ayer con fecha de hoy.
 *   3. Reconstrucción del histórico, autocurativa. Solo lee precios de la caché (no vuelve a bajar
 *      5 años cada noche); repara altas reconstruidas con el histórico a medio traer.
 *   4. Alertas de hitos FIRE (opt-in) sobre el snapshot recién capturado.
 *
 * El intradía (`PRICE_INTRADAY_CRON`, `off` lo desactiva) solo actualiza precios y FX; el
 * nocturno deja la fila del día con el cierre. Comparten un cerrojo en memoria para no duplicar
 * peticiones a Yahoo: el intradía (y el arranque) se salta si hay otro trabajo en marcha, pero el
 * NOCTURNO espera a que termine, porque saltárselo dejaría el día sin snapshot. El cerrojo es de
 * proceso, no distribuido: vale porque la API corre en una sola réplica. Un
 * `pg_try_advisory_lock` serviría con varias réplicas, pero es de SESIÓN: exige reservar una
 * conexión del pool durante todo el trabajo y sondear para la espera del nocturno; no compensa
 * mientras haya una sola instancia.
 *
 * Vive aquí y no en `prices/` porque el snapshot necesita `PortfolioModule`, que depende de
 * `PricesModule`: colgarlo de `prices/` crearía un ciclo que solo se rompe con `forwardRef`.
 */
@Injectable()
export class DailyJobsScheduler implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DailyJobsScheduler.name);
  /** Trabajo en marcha (nunca rechaza), o null si el cerrojo está libre. */
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
    this.logger.log(`Trabajo diario de cartera programado: "${cronTime}" (${TIME_ZONE})`);

    const intradayTime = scheduleFromEnv(this.registry, {
      name: 'intraday-price-refresh',
      cronTime: this.config.get('PRICE_INTRADAY_CRON', { infer: true }),
      defaultCron: DEFAULT_INTRADAY_CRON,
      handler: () => void this.runIntraday(),
      off: INTRADAY_OFF,
    });
    if (intradayTime === undefined) {
      this.logger.log('Refresco intradía de precios desactivado (PRICE_INTRADAY_CRON=off)');
      return;
    }
    this.logger.log(`Refresco intradía de precios programado: "${intradayTime}" (${TIME_ZONE})`);
  }

  /**
   * Pasada de arranque: repara huecos de usuarios existentes sin esperar al cron. Va aquí y no
   * en `onModuleInit` (depende del orden entre `PricesModule` y `PortfolioModule`), sin bloquear
   * `listen()` y tolerante a fallos.
   */
  onApplicationBootstrap(): void {
    // Mismo cerrojo: puede pedir decenas de históricos a Yahoo y no debe solaparse con un refresco.
    void this.exclusive('arranque', () => this.bootstrapBackfill());
  }

  private async bootstrapBackfill(): Promise<void> {
    await this.steps([
      ['Backfill de histórico de precios al arrancar', () => this.prices.ensureHistoryForActivePositions()],
      ['Backfill de snapshots al arrancar', () => this.snapshots.backfillAll()],
      ['Clasificación de posiciones', () => this.assetClasses.classifyMissing()],
    ]);
  }

  /**
   * Ejecuta los pasos en orden, cada uno con su propio `try/catch`: el fallo de uno se registra
   * con su nombre y no impide los siguientes (con la fuente caída, el snapshot se guarda igual).
   */
  private async steps(steps: readonly JobStep[]): Promise<void> {
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (error) {
        this.logger.error(`${name} falló: ${errorMessage(error)}`);
      }
    }
  }

  /** Pasos con errores capturados por separado: con la fuente caída el snapshot se guarda igual (precios de ayer, mejor que un hueco). */
  async run(): Promise<void> {
    await this.exclusive('nocturno', () => this.runNightly(), 'wait');
  }

  async runIntraday(): Promise<void> {
    await this.exclusive('intradía', () =>
      this.steps([
        [
          'Refresco intradía de precios',
          async () => {
            const summary = await this.prices.refreshAll();
            this.logger.log(`Refresco intradía: ${summary.fetched}/${summary.symbols} símbolos`);
          },
        ],
      ]),
    );
  }

  /**
   * Ejecuta `task` con el cerrojo. Si hay otro trabajo en marcha, `skip` lo omite (y lo registra)
   * y `wait` espera a que termine antes de empezar. El cerrojo se libera siempre.
   */
  private async exclusive(label: string, task: () => Promise<void>, onBusy: 'skip' | 'wait' = 'skip'): Promise<void> {
    while (this.current) {
      if (onBusy === 'skip') {
        this.logger.warn(`Trabajo ${label} omitido: hay otro trabajo de precios en marcha`);
        return;
      }
      this.logger.warn(`Trabajo ${label} en espera: hay otro trabajo de precios en marcha`);
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
    // Las alertas evalúan este snapshot concreto (ver `evaluateAll`).
    let captureDate: string | undefined;
    await this.steps([
      ['Refresco de precios', () => this.prices.refreshAll()],
      [
        'Captura de snapshots',
        async () => {
          captureDate = (await this.snapshots.captureAll()).date;
        },
      ],
      ['Backfill de snapshots', () => this.snapshots.backfillAll()],
      [
        'Evaluación de alertas FIRE',
        async () => {
          const alerts = await this.fireAlerts.evaluateAll(captureDate);
          if (alerts.users > 0) {
            this.logger.log(
              `Alertas FIRE: ${alerts.sent} enviadas, ${alerts.failed} fallidas, ${alerts.users} usuarios`,
            );
          }
        },
      ],
      // Splits de los símbolos en uso con marca de más de 7 días (1 llamada por símbolo y semana).
      // Va tras las alertas: el snapshot y los avisos no deben esperar a Yahoo.
      ['Refresco de splits', () => this.prices.refreshStaleSplits()],
      // Con los dividendos de mercado recién cacheados (viajan con los splits), se completan los cobros pendientes.
      ['Resolución de dividendos', () => this.dividends.resolvePending()],
      ['Clasificación de posiciones', () => this.assetClasses.classifyMissing()],
    ]);
  }
}
