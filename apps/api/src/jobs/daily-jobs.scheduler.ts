import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PortfolioSnapshotsService } from '../portfolio/portfolio-snapshots.service.js';
import { PricesService } from '../prices/prices.service.js';

/** Por defecto: cada día a las 22:30 hora de Madrid. Formato de 6 campos (s m h D M W). */
const DEFAULT_CRON = '0 30 22 * * *';
const TIME_ZONE = 'Europe/Madrid';

/**
 * Trabajo nocturno de la cartera, en DOS pasos y en este orden:
 *   1. Refresco de precios de todos los símbolos en uso y de los pares FX.
 *   2. Snapshot de valoración de la cartera de cada usuario.
 *
 * El orden importa: el snapshot valora con el último precio conocido, así que capturarlo
 * ANTES del refresco guardaría el cierre de ayer con fecha de hoy.
 *
 * Se ejecuta TODOS los días (no solo en días de bolsa): en findes/festivos las acciones
 * devuelven el último cierre y la cripto —que cotiza 24/7— se actualiza igualmente; el
 * snapshot diario tampoco puede tener huecos si la gráfica ha de ser continua.
 *
 * Hora: 22:30 de Madrid, ya cerrada tanto la bolsa europea como la estadounidense (que
 * cierra ~22:00 hora de Madrid). Configurable con `PRICE_REFRESH_CRON`.
 *
 * POR QUÉ AQUÍ y no en `prices/`: el snapshot necesita la valoración (`PortfolioModule`), que
 * a su vez depende de `PricesModule`. Colgar el cron de `prices/` obligaría a la dependencia
 * inversa —un ciclo que solo se rompe con `forwardRef`—, así que el orquestador vive en su
 * propio módulo, por encima de los dos. En DESARROLLO no se depende de esto: está el trigger
 * manual `POST /api/prices/refresh`.
 */
@Injectable()
export class DailyJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(DailyJobsScheduler.name);

  constructor(
    private readonly prices: PricesService,
    private readonly snapshots: PortfolioSnapshotsService,
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // `|| DEFAULT_CRON` (no `??`): la env vacía del compose llega como "" y debe caer al default.
    const cronTime = this.config.get<string>('PRICE_REFRESH_CRON')?.trim() || DEFAULT_CRON;
    const job = new CronJob(cronTime, () => void this.run(), null, false, TIME_ZONE);
    this.registry.addCronJob('daily-portfolio-jobs', job);
    job.start();
    this.logger.log(`Trabajo diario de cartera programado: "${cronTime}" (${TIME_ZONE})`);
  }

  /**
   * Ejecuta los dos pasos capturando errores por separado: si la fuente de precios está
   * caída, el snapshot se guarda igual (con los precios de ayer, que es información válida y
   * mejor que un hueco en la serie), y ningún fallo tumba el proceso.
   */
  private async run(): Promise<void> {
    try {
      await this.prices.refreshAll();
    } catch (error) {
      this.logger.error(`Refresco de precios falló: ${(error as Error).message}`);
    }

    try {
      await this.snapshots.captureAll();
    } catch (error) {
      this.logger.error(`Captura de snapshots falló: ${(error as Error).message}`);
    }
  }
}
