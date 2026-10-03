import type { ConfigService } from '@nestjs/config';

import { parseEnv, type Env } from '../src/config/env.js';
import { stub } from './factories.js';

/**
 * Minimal `ConfigService` for unit tests, backed by the real schema: the defaults and the
 * conversions (numbers, booleans) are the production ones rather than a mock's.
 */
export function fakeConfig(overrides: Record<string, string> = {}): ConfigService<Env, true> {
  const env = parseEnv({
    DATABASE_URL: 'postgres://test',
    JWT_SECRET: 'test-secret',
    APP_URL: 'https://sextante.test',
    ...overrides,
  });
  return stub<ConfigService<Env, true>>({
    get: <K extends keyof Env>(key: K) => env[key],
    getOrThrow: <K extends keyof Env>(key: K) => env[key],
  });
}
