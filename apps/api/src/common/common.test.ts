import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomToken, sha256Hex } from './crypto.js';
import { isoDate, todayUtc } from './dates.js';
import { errorMessage } from './errors.js';
import { numberOrNull } from './numeric.js';
import { scheduleFromEnv } from './schedule.js';
import { firstItem } from '@sextante/core/arrays';

describe('dates', () => {
  afterEach(() => vi.useRealTimers());

  it('isoDate devuelve el día UTC, no el local', () => {
    expect(isoDate(new Date('2026-03-31T23:59:59.999Z'))).toBe('2026-03-31');
    expect(isoDate(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01');
  });

  it('todayUtc usa el reloj actual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T23:30:00Z'));
    expect(todayUtc()).toBe('2026-10-01');
  });
});

describe('crypto', () => {
  it('sha256Hex coincide con el vector conocido (los hashes ya guardados deben seguir casando)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('randomToken son 256 bits en base64url y no se repite', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });
});

describe('scheduleFromEnv', () => {
  const started: CronJob[] = [];

  afterEach(() => {
    started.splice(0).forEach((job) => void job.stop());
  });

  function setup() {
    const registry = {
      addCronJob: vi.fn((_name: string, job: CronJob) => started.push(job)),
    };
    return { registry, asRegistry: registry as unknown as SchedulerRegistry };
  }

  it('usa el valor por defecto si la variable falta o está vacía', () => {
    const { registry, asRegistry } = setup();
    for (const cronTime of [undefined, '', '   ']) {
      expect(scheduleFromEnv(asRegistry, { name: 'job', cronTime, defaultCron: '0 0 3 * * *', handler: vi.fn() })).toBe(
        '0 0 3 * * *',
      );
    }
    expect(registry.addCronJob).toHaveBeenCalledTimes(3);
  });

  it('respeta una expresión personalizada, con espacios recortados, y arranca el job', () => {
    const { registry, asRegistry } = setup();
    const scheduled = scheduleFromEnv(asRegistry, {
      name: 'custom',
      cronTime: ' 0 */5 * * * * ',
      defaultCron: '0 0 3 * * *',
      handler: vi.fn(),
    });
    expect(scheduled).toBe('0 */5 * * * *');
    const [name, job] = firstItem(registry.addCronJob.mock.calls);
    expect(name).toBe('custom');
    expect(job.isActive).toBe(true);
    expect(String(job.cronTime.timeZone)).toBe('Europe/Madrid');
  });

  it('con `off` (sin distinguir mayúsculas) no registra nada y devuelve undefined', () => {
    const { registry, asRegistry } = setup();
    const options = { name: 'job', defaultCron: '0 0 3 * * *', handler: vi.fn(), off: 'off' };
    expect(scheduleFromEnv(asRegistry, { ...options, cronTime: 'OFF' })).toBeUndefined();
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('sin `off` configurado, "off" no es un valor especial (y una expresión inválida lanza)', () => {
    const { asRegistry } = setup();
    expect(() =>
      scheduleFromEnv(asRegistry, { name: 'job', cronTime: 'off', defaultCron: '0 0 3 * * *', handler: vi.fn() }),
    ).toThrow();
  });
});

describe('errorMessage', () => {
  it('usa el message de un Error y convierte a texto lo que no lo es', () => {
    expect(errorMessage(new Error('fallo'))).toBe('fallo');
    expect(errorMessage('texto lanzado')).toBe('texto lanzado');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

describe('numberOrNull', () => {
  it('convierte el numeric de Drizzle y conserva el null', () => {
    expect(numberOrNull('12.500000')).toBe(12.5);
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull(null)).toBeNull();
  });
});
