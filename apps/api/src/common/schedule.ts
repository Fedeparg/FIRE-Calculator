import type { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

/** Zona horaria de todos los trabajos programados. */
export const TIME_ZONE = 'Europe/Madrid';

export interface ScheduleFromEnvOptions {
  /** Nombre con el que se registra el trabajo en el `SchedulerRegistry`. */
  name: string;
  /** Valor crudo de la variable de entorno (puede faltar o venir vacío). */
  cronTime: string | undefined;
  /** Expresión de 6 campos (s m h D M W) si la variable falta o está vacía. */
  defaultCron: string;
  handler: () => void;
  /** Valor (sin distinguir mayúsculas) que desactiva el trabajo; sin él, cualquier valor se trata como cron. */
  off?: string;
}

/**
 * Programa un trabajo con la expresión de una variable de entorno. Se hace a mano porque
 * `@Cron` recibe su expresión al decorar, antes de que exista `ConfigService`.
 * Devuelve la expresión programada, o `undefined` si la variable valía `off`.
 */
export function scheduleFromEnv(registry: SchedulerRegistry, options: ScheduleFromEnvOptions): string | undefined {
  // `|| defaultCron` (no `??`): la env vacía del compose llega como "" y debe caer al default.
  const cronTime = options.cronTime?.trim() || options.defaultCron;
  if (options.off !== undefined && cronTime.toLowerCase() === options.off.toLowerCase()) {
    return undefined;
  }
  const job = new CronJob(cronTime, options.handler, null, false, TIME_ZONE);
  registry.addCronJob(options.name, job);
  job.start();
  return cronTime;
}
