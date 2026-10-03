import type { ConfigService } from '@nestjs/config';

import { parseEnv, type Env } from '../src/config/env.js';
import { stub } from './factories.js';

/**
 * `ConfigService` mínimo para tests unitarios, respaldado por el esquema real: así los
 * defectos y las conversiones (números, booleanos) son los de producción y no los de un mock.
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
