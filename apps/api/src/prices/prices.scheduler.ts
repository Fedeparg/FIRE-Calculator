import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PricesService } from './prices.service';

/** Por defecto: cada día a las 22:30 hora de Madrid. Formato de 6 campos (s m h D M W). */
const DEFAULT_CRON = '0 30 22 * * *';
const TIME_ZONE = 'Europe/Madrid';

/**
 * Dispara el refresco diario de precios. Se ejecuta TODOS los días (no solo en días de
 * bolsa): en findes/festivos las acciones devuelven el último cierre y la cripto —que
 * cotiza 24/7— se actualiza igualmente.
 *
 * Hora: 22:30 de Madrid, ya cerrada tanto la bolsa europea como la estadounidense (que
 * cierra ~22:00 hora de Madrid). Configurable con `PRICE_REFRESH_CRON`.
 *
 * En DESARROLLO no se depende de esto: se usa el trigger manual `POST /api/prices/refresh`
 * para no esperar a la noche.
 */
@Injectable()
export class PricesScheduler implements OnModuleInit {
  private readonly logger = new Logger(PricesScheduler.name);

  constructor(
    private readonly prices: PricesService,
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // `|| DEFAULT_CRON` (no `??`): la env vacía del compose llega como "" y debe caer al default.
    const cronTime = this.config.get<string>('PRICE_REFRESH_CRON')?.trim() || DEFAULT_CRON;
    const job = new CronJob(cronTime, () => void this.run(), null, false, TIME_ZONE);
    this.registry.addCronJob('price-refresh', job);
    job.start();
    this.logger.log(`Refresco de precios programado: "${cronTime}" (${TIME_ZONE})`);
  }

  /** Ejecuta el refresco capturando errores: un fallo de la fuente no debe tumbar el proceso. */
  private async run(): Promise<void> {
    try {
      await this.prices.refreshAll();
    } catch (error) {
      this.logger.error(`Refresco de precios falló: ${(error as Error).message}`);
    }
  }
}
