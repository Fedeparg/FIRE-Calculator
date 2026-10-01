import { describe, expect, it } from 'vitest';

import { DEV_JWT_SECRET, parseDatabaseEnv, parseEnv } from './env.js';

const MIN = { DATABASE_URL: 'postgres://db', JWT_SECRET: 'a-strong-secret', APP_URL: 'https://sextante.test' };

describe('parseEnv', () => {
  it('aplica los defectos con solo las variables obligatorias', () => {
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
    });
  });

  it('trata la cadena vacía del compose como ausente', () => {
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

  it('convierte PORT a número y recorta los textos opcionales', () => {
    const env = parseEnv({ ...MIN, PORT: '8080', PRICE_INTRADAY_CRON: ' off ', OPENFIGI_API_KEY: ' key ' });

    expect(env.PORT).toBe(8080);
    expect(env.PRICE_INTRADAY_CRON).toBe('off');
    expect(env.OPENFIGI_API_KEY).toBe('key');
  });

  it('COOKIE_SECURE solo es true con el texto exacto "true"', () => {
    expect(parseEnv({ ...MIN, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    for (const value of ['false', 'TRUE', '1', 'yes']) {
      expect(parseEnv({ ...MIN, COOKIE_SECURE: value }).COOKIE_SECURE).toBe(false);
    }
  });

  it('TRUST_PROXY_HOPS acepta enteros >= 0 y cae a 1 con un valor inválido', () => {
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '0' }).TRUST_PROXY_HOPS).toBe(0);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: 'dos' }).TRUST_PROXY_HOPS).toBe(1);
    expect(parseEnv({ ...MIN, TRUST_PROXY_HOPS: '-1' }).TRUST_PROXY_HOPS).toBe(1);
  });

  it('las retenciones solo aceptan enteros > 0 y si no caen a su defecto', () => {
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: '5' }).MCP_AUDIT_RETENTION_DAYS).toBe(5);
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: '0' }).MCP_AUDIT_RETENTION_DAYS).toBe(180);
    expect(parseEnv({ ...MIN, MCP_AUDIT_RETENTION_DAYS: 'cero' }).MCP_AUDIT_RETENTION_DAYS).toBe(180);
    expect(parseEnv({ ...MIN, OAUTH_CLIENT_RETENTION_DAYS: '-3' }).OAUTH_CLIENT_RETENTION_DAYS).toBe(30);
  });

  it('exige DATABASE_URL, JWT_SECRET y APP_URL y las lista todas juntas', () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL: DATABASE_URL es obligatoria[\s\S]*JWT_SECRET: JWT_SECRET es obligatoria[\s\S]*APP_URL: APP_URL es obligatoria/,
    );
    expect(() => parseEnv({ ...MIN, JWT_SECRET: '' })).toThrow(/JWT_SECRET es obligatoria/);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['EMAIL_TRANSPORT', 'smtp'],
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
  ])('rechaza %s=%s con un mensaje que nombra la variable', (name, value) => {
    expect(() => parseEnv({ ...MIN, [name]: value })).toThrow(
      new RegExp(`Configuración de entorno inválida[\\s\\S]*${name}:`),
    );
  });

  describe('JWT_SECRET en producción', () => {
    it('rechaza el secreto de desarrollo', () => {
      expect(() => parseEnv({ ...MIN, NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET })).toThrow(
        /JWT_SECRET: usa el valor de desarrollo en producción/,
      );
    });

    it('acepta un secreto fuerte', () => {
      expect(parseEnv({ ...MIN, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    });

    it('permite el secreto de desarrollo fuera de producción', () => {
      expect(parseEnv({ ...MIN, JWT_SECRET: DEV_JWT_SECRET }).JWT_SECRET).toBe(DEV_JWT_SECRET);
      expect(parseEnv({ ...MIN, NODE_ENV: 'test', JWT_SECRET: DEV_JWT_SECRET }).JWT_SECRET).toBe(DEV_JWT_SECRET);
    });
  });

  describe('EMAIL_TRANSPORT=resend', () => {
    it('exige RESEND_API_KEY y EMAIL_FROM', () => {
      expect(() => parseEnv({ ...MIN, EMAIL_TRANSPORT: 'resend' })).toThrow(
        /RESEND_API_KEY: es obligatoria[\s\S]*EMAIL_FROM: es obligatoria/,
      );
      expect(() => parseEnv({ ...MIN, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: '' })).toThrow(
        /EMAIL_FROM: es obligatoria/,
      );
    });

    it('arranca con ambas definidas', () => {
      const env = parseEnv({
        ...MIN,
        EMAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_x',
        EMAIL_FROM: 'Sextante <a@b.c>',
      });
      expect(env.EMAIL_FROM).toBe('Sextante <a@b.c>');
    });

    it('no pide nada de Resend con el transporte dev', () => {
      expect(parseEnv({ ...MIN, EMAIL_TRANSPORT: 'dev' }).RESEND_API_KEY).toBeUndefined();
    });
  });
});

describe('parseDatabaseEnv', () => {
  it('solo exige DATABASE_URL', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: 'postgres://db' })).toEqual({ DATABASE_URL: 'postgres://db' });
  });

  it('falla sin DATABASE_URL o con ella vacía', () => {
    expect(() => parseDatabaseEnv({})).toThrow(/DATABASE_URL es obligatoria/);
    expect(() => parseDatabaseEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL es obligatoria/);
  });
});
