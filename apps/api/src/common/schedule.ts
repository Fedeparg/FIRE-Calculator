import type { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

/** Time zone of every scheduled job. */
export const TIME_ZONE = 'Europe/Madrid';

export interface ScheduleFromEnvOptions {
  /** Name the job is registered under in the `SchedulerRegistry`. */
  name: string;
  /** Raw value of the environment variable (may be missing or empty). */
  cronTime: string | undefined;
  /** 6-field expression (s m h D M W) used when the variable is missing or empty. */
  defaultCron: string;
  handler: () => void;
  /** Value (case-insensitive) that disables the job; without it, any value is treated as a cron. */
  off?: string;
}

/**
 * Schedules a job with the expression from an environment variable. Done by hand because
 * `@Cron` receives its expression at decoration time, before `ConfigService` exists.
 * Returns the scheduled expression, or `undefined` if the variable was `off`.
 */
export function scheduleFromEnv(registry: SchedulerRegistry, options: ScheduleFromEnvOptions): string | undefined {
  // `|| defaultCron` (not `??`): an empty env var from compose arrives as "" and must fall back to the default.
  const cronTime = options.cronTime?.trim() || options.defaultCron;
  if (options.off !== undefined && cronTime.toLowerCase() === options.off.toLowerCase()) {
    return undefined;
  }
  const job = new CronJob(cronTime, options.handler, null, false, TIME_ZONE);
  registry.addCronJob(options.name, job);
  job.start();
  return cronTime;
}
