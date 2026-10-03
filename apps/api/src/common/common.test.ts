import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstItem } from '@sextante/core/arrays';

import { randomToken, sha256Hex } from './crypto.js';
import { isoDate, todayUtc } from './dates.js';
import { errorMessage } from './errors.js';
import { numberOrNull } from './numeric.js';
import { scheduleFromEnv } from './schedule.js';
import { stub } from '../../test/factories.js';

describe('dates', () => {
  afterEach(() => vi.useRealTimers());

  it('isoDate returns the UTC day, not the local one', () => {
    expect(isoDate(new Date('2026-03-31T23:59:59.999Z'))).toBe('2026-03-31');
    expect(isoDate(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01');
  });

  it('todayUtc uses the current clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T23:30:00Z'));
    expect(todayUtc()).toBe('2026-10-01');
  });
});

describe('crypto', () => {
  it('sha256Hex matches the known test vector (stored hashes must keep matching)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('randomToken is 256 bits in base64url and does not repeat', () => {
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
    return { registry, asRegistry: stub<SchedulerRegistry>(registry) };
  }

  it('uses the default when the variable is missing or empty', () => {
    const { registry, asRegistry } = setup();
    for (const cronTime of [undefined, '', '   ']) {
      expect(scheduleFromEnv(asRegistry, { name: 'job', cronTime, defaultCron: '0 0 3 * * *', handler: vi.fn() })).toBe(
        '0 0 3 * * *',
      );
    }
    expect(registry.addCronJob).toHaveBeenCalledTimes(3);
  });

  it('honours a custom expression, trimmed, and starts the job', () => {
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

  it('with `off` (case-insensitive) registers nothing and returns undefined', () => {
    const { registry, asRegistry } = setup();
    const options = { name: 'job', defaultCron: '0 0 3 * * *', handler: vi.fn(), off: 'off' };
    expect(scheduleFromEnv(asRegistry, { ...options, cronTime: 'OFF' })).toBeUndefined();
    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('without `off` configured, "off" is not a special value (and an invalid expression throws)', () => {
    const { asRegistry } = setup();
    expect(() =>
      scheduleFromEnv(asRegistry, { name: 'job', cronTime: 'off', defaultCron: '0 0 3 * * *', handler: vi.fn() }),
    ).toThrow();
  });
});

describe('errorMessage', () => {
  it('uses the message of an Error and stringifies anything else', () => {
    expect(errorMessage(new Error('failure'))).toBe('failure');
    expect(errorMessage('thrown text')).toBe('thrown text');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

describe('numberOrNull', () => {
  it('converts the Drizzle numeric and keeps null', () => {
    expect(numberOrNull('12.500000')).toBe(12.5);
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull(null)).toBeNull();
  });
});
