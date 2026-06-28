import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { lt } from 'drizzle-orm';

import { DRIZZLE, type Database } from '../db/database.module';
import { oauthAuthCodes, oauthTokens } from '../db/schema';

/** Por defecto: cada hora en el minuto 15. Formato de 6 campos (s m h D M W). */
const DEFAULT_CRON = '0 15 * * * *';
const TIME_ZONE = 'Europe/Madrid';

/**
 * Limpia códigos de autorización y tokens OAuth CADUCADOS (`expiresAt < now`). Higiene de la
 * base de datos: los códigos viven ~60 s y los access tokens 1 h, así que se acumularían
 * filas muertas. Se borran SOLO los caducados (no los consumidos-pero-vigentes): un refresh
 * ya consumido pero no caducado debe conservarse para detectar su reuso (rotación). Como un
 * token caducado ya no sirve, borrarlo no afecta a la seguridad.
 *
 * Análogo al `PricesScheduler`. Configurable con `OAUTH_REAPER_CRON`.
 */
@Injectable()
export class OAuthReaper implements OnModuleInit {
  private readonly logger = new Logger(OAuthReaper.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // `|| DEFAULT_CRON` (no `??`): la env vacía del compose llega como "" y debe caer al default.
    const cronTime = this.config.get<string>('OAUTH_REAPER_CRON')?.trim() || DEFAULT_CRON;
    const job = new CronJob(cronTime, () => void this.run(), null, false, TIME_ZONE);
    this.registry.addCronJob('oauth-reaper', job);
    job.start();
    this.logger.log(`Limpieza de OAuth programada: "${cronTime}" (${TIME_ZONE})`);
  }

  /** Borra códigos y tokens caducados. Captura errores: un fallo no debe tumbar el proceso. */
  private async run(): Promise<void> {
    try {
      const now = new Date();
      const codes = await this.db
        .delete(oauthAuthCodes)
        .where(lt(oauthAuthCodes.expiresAt, now))
        .returning({ codeHash: oauthAuthCodes.codeHash });
      const tokens = await this.db
        .delete(oauthTokens)
        .where(lt(oauthTokens.expiresAt, now))
        .returning({ tokenHash: oauthTokens.tokenHash });
      if (codes.length || tokens.length) {
        this.logger.log(
          `Limpieza OAuth: ${codes.length} códigos y ${tokens.length} tokens caducados`,
        );
      }
    } catch (error) {
      this.logger.error(`Limpieza OAuth falló: ${(error as Error).message}`);
    }
  }
}
