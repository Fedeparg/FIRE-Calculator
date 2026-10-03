import { describe, expect, it } from 'vitest';

import { DEV_JWT_SECRET, MIN_PRODUCTION_JWT_SECRET_LENGTH, parseDatabaseEnv, parseEnv } from './env.js';

const MIN = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'a-strong-secret', APP_URL: 'https://sextante.test' };

describe('parseEnv', () => {
  it('applies the defaults with only the required variables', () => {
    expect(parseEnv(MIN)).toEqual({
      ...MIN,
      NODE_ENV: 'development',
      PORT: 3001,
      COOKIE_SECURE: false,
      TRUST_PROXY_HOPS: 1,
      EMAIL_TRANSPORT: 'dev',
      LOGIN_TOKEN_RETENTION_DAYS: 30,
      MCP_AUDIT_RETENTION_DAYS: 180,
      OAUTH_CLIENT_RETENTION_DAYS: 30,
      DB_IDLE_TIMEOUT_SECONDS: 30,
      DB_CONNECT_TIMEOUT_SECONDS: 10,
      DB_STATEMENT_TIMEOUT_MS: 30_000,
    });
  });

  it('treats the empty string from compose as absent', () => {
    const env = parseEnv({
      ...MIN,
      PORT: '',
      NODE_ENV: '',
      EMAIL_TRANSPORT: '',
      TRUST_PROXY_HOPS: '  ',
      LOGIN_TOKEN_RETENTION_DAYS: '',
      OPENFIGI_API_KEY: '',
      STRIPE_SECRET_KEY: '',
      PRICE_REFRESH_CRON: '',
      PRICE_INTRADAY_CRON: '',
      OAUTH_REAPER_CRON: '',
    });

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.EMAIL_TRANSPORT).toBe('dev');
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.LOGIN_TOKEN_RETENTION_DAYS).toBe(30);
    expect(env.OPENFIGI_API_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.PRICE_REFRESH_CRON).toBeUndefined();
    expect(env.PRICE_INTRADAY_CRON).toBeUndefined();
    expect(env.OAUTH_REAPER_CRON).toBeUndefined();
  });

  it('converts PORT to a number and trims optional text', () => {
    const env = parseEnv({ ...MIN, PORT: '8080', PRICE_INTRADAY_CRON: ' off ', OPENFIGI_API_KEY: ' key ' });

    expect(env.PORT).toBe(8080);
    expect(env.PRICE_INTRADAY_CRON).toBe('off');
    expect(env.OPENFIGI_API_KEY).toBe('key');
  });

  it('COOKIE_SECURE is true only for the exact text "true"', () => {
    expect(parseEnv({ ...MIN, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    for (const value of ['false', 'TRUE', '1', 'yes']) {
      expect(parseEnv({ ...MIN, COOKIE_SECURE: value }).COOKIE_SECURE).toBe(false);
    }
  });

  it('TRUST_PROXY_HOPS accepts integers >= 0 and falls back to 1 on an invalid value', () => {
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '0' }).TRUST_PROXY_HOPS).toBe(0);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: 'two' }).TRUST_PROXY_HOPS).toBe(1);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '-1' }).TRUST_PROXY_HOPS).toBe(1);
  });

  it('retention settings accept only integers > 0 and otherwise fall back to their default', () => {
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: '5' }).MCP_AUDIT_RETENTION_DAYS).toBe(5);
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: '0' }).MCP_AUDIT_RETENTION_DAYS).toBe(180);
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: 'zero' }).MCP_AUDIT_RETENTION_DAYS).toBe(180);
    expect(parseEnv({ ...MIN, OAUTH_CLIENT_RETENTION_DAYS: '-3' }).OAUTH_CLIENT_RETENTION_DAYS).toBe(30);
  });

  it('requires DATABASE_URL, JWT_SECRET and APP_URL and lists them all together', () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL: DATABASE_URL is required[\s\S]*JWT_SECRET: JWT_SECRET is required[\s\S]*APP_URL: APP_URL is required/,
    );
    expect(() => parseEnv({ ...MIN, JWT_SECRET: '' })).toThrow(/JWT_SECRET is required/);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['EMAIL_TRANSPORT', 'smtp'],
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
  ])('rejects %s=%s with a message naming the variable', (name, value) => {
    expect(() => parseEnv({ ...MIN, [name]: value })).toThrow(
      new RegExp(`Invalid environment configuration[\\s\\S]*${name}:`),
    );
  });

  describe('production', () => {
    /** Minimal valid production config: long secret, Secure cookie and https APP_URL. */
    const PROD = {
      ...MIN,
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH),
      COOKIE_SECURE: 'true',
    };

    it('rejects the development secret', () => {
      expect(() => parseEnv({ ...PROD, JWT_SECRET: DEV_JWT_SECRET })).toThrow(
        /JWT_SECRET: uses the development value in production/,
      );
    });

    it('rejects a secret shorter than 32 characters', () => {
      expect(() => parseEnv({ ...PROD, JWT_SECRET: 'x'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH - 1) })).toThrow(
        /JWT_SECRET: must be at least 32 characters long/,
      );
    });

    it('requires COOKIE_SECURE=true', () => {
      expect(() => parseEnv({ ...PROD, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE: must be "true"/);
      expect(() => parseEnv({ ...PROD, COOKIE_SECURE: undefined })).toThrow(/COOKIE_SECURE/);
    });

    it('requires an https APP_URL', () => {
      expect(() => parseEnv({ ...PROD, APP_URL: 'http://sextante.test' })).toThrow(/APP_URL: must start with https/);
    });

    it('accepts a secure configuration', () => {
      expect(parseEnv(PROD).NODE_ENV).toBe('production');
    });

    it('allows the development secret outside production', () => {
      expect(parseEnv({ ...MIN, JWT_SECRET: DEV_JWT_SECRET }).JWT_SECRET).toBe(DEV_JWT_SECRET);
      expect(parseEnv({ ...MIN, NODE_ENV: 'test', JWT_SECRET: DEV_JWT_SECRET }).JWT_SECRET).toBe(DEV_JWT_SECRET);
    });
  });

  describe('EMAIL_TRANSPORT=resend', () => {
    it('requires RESEND_API_KEY and EMAIL_FROM', () => {
      expect(() => parseEnv({ ...MIN, EMAIL_TRANSPORT: 'resend' })).toThrow(
        /RESEND_API_KEY: is required[\s\S]*EMAIL_FROM: is required/,
      );
      expect(() => parseEnv({ ...MIN, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: '' })).toThrow(
        /EMAIL_FROM: is required/,
      );
    });

    it('starts with both set', () => {
      const env = parseEnv({
        ...MIN,
        EMAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_x',
        EMAIL_FROM: 'Sextante <a@b.c>',
      });
      expect(env.EMAIL_FROM).toBe('Sextante <a@b.c>');
    });

    it('requires nothing from Resend with the dev transport', () => {
      expect(parseEnv({ ...MIN, EMAIL_TRANSPORT: 'dev' }).RESEND_API_KEY).toBeUndefined();
    });
  });
});

describe('parseDatabaseEnv', () => {
  it('requires only DATABASE_URL', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: 'postgres://db' })).toEqual({ DATABASE_URL: 'postgres://db' });
  });

  it('fails without DATABASE_URL or with it empty', () => {
    expect(() => parseDatabaseEnv({})).toThrow(/DATABASE_URL is required/);
    expect(() => parseDatabaseEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL is required/);
  });
});
