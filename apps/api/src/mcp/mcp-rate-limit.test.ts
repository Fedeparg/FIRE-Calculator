import { createHash, randomBytes } from 'node:crypto';

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { describe, expect, it } from 'vitest';

import {
  createMcpIpRateLimiter,
  createMcpTokenRateLimiter,
  mcpIpRateLimitKey,
  mcpTokenRateLimitKey,
} from './mcp-rate-limit.js';
import { stub } from '../../test/factories.js';

/** Petición mínima con lo único que miran los limitadores (cabeceras, IP resuelta por Express y `auth`). */
function request(opts: { authorization?: string; ip?: string; token?: string }): Request {
  const auth: AuthInfo | undefined = opts.token ? { token: opts.token, clientId: 'c', scopes: [] } : undefined;
  return {
    headers: opts.authorization ? { authorization: opts.authorization } : {},
    ip: opts.ip,
    method: 'POST',
    auth,
  } as Partial<Request> as Request;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Pasa una petición por un limitador real de `express-rate-limit` con una respuesta mínima y
 * devuelve el status: 429 si la cortó, 200 si llamó a `next()`.
 */
async function pass(limiter: RateLimitRequestHandler, req: Request): Promise<number> {
  let status = 200;
  const res = {
    headersSent: false,
    setHeader: () => res,
    getHeader: () => undefined,
    append: () => res,
    on: () => res,
    status(code: number) {
      status = code;
      return res;
    },
    json: () => res,
    send: () => res,
  };
  await new Promise<void>((resolve, reject) => {
    const next: NextFunction = (error?: unknown) =>
      error ? reject(new Error('El limitador llamó a next() con un error', { cause: error })) : resolve();
    void Promise.resolve(limiter(req, stub<Response>(res), next)).then(() => resolve(), reject);
  });
  return status;
}

describe('mcpIpRateLimitKey', () => {
  it('usa la IP, no la cabecera Authorization', () => {
    expect(mcpIpRateLimitKey(request({ ip: '203.0.113.7', authorization: 'Bearer x' }))).toBe('ip:203.0.113.7');
  });

  it('agrupa las IPv6 por subred /64 (rotar de dirección no burla el límite)', () => {
    const first = mcpIpRateLimitKey(request({ ip: '2001:db8:1234:5678:1111:2222:3333:4444' }));
    const second = mcpIpRateLimitKey(request({ ip: '2001:db8:1234:5678:9999:8888:7777:6666' }));

    expect(first).toBe(second);
  });

  it('nunca devuelve una clave vacía aunque falte la IP', () => {
    expect(mcpIpRateLimitKey(request({}))).toBe('ip:unknown');
  });
});

describe('mcpTokenRateLimitKey', () => {
  it('usa el hash del token VERIFICADO, no el token en claro', () => {
    const key = mcpTokenRateLimitKey(request({ token: 'secreto-en-claro' }));

    expect(key).toBe(`token:${sha256('secreto-en-claro')}`);
    expect(key).not.toContain('secreto-en-claro');
  });

  it('ignora la cabecera Authorization: sin token verificado cae a la IP', () => {
    expect(mcpTokenRateLimitKey(request({ authorization: 'Bearer cualquiera', ip: '10.0.0.1' }))).toBe('ip:10.0.0.1');
  });

  it('mete al mismo token en el mismo cubo aunque cambie de IP, y separa tokens distintos', () => {
    const first = mcpTokenRateLimitKey(request({ token: 't', ip: '1.2.3.4' }));
    const second = mcpTokenRateLimitKey(request({ token: 't', ip: '5.6.7.8' }));
    const other = mcpTokenRateLimitKey(request({ token: 'u', ip: '1.2.3.4' }));

    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });
});

describe('limitadores del endpoint MCP', () => {
  it('el de IP corta a quien rota Bearers basura en cada petición', async () => {
    const limiter = createMcpIpRateLimiter(3);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const junk = `Bearer ${randomBytes(16).toString('hex')}`;
      statuses.push(await pass(limiter, request({ authorization: junk, ip: '198.51.100.9' })));
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('el de token cuenta por identidad verificada, con independencia de la IP', async () => {
    const limiter = createMcpTokenRateLimiter(2);

    expect(await pass(limiter, request({ token: 'a', ip: '1.1.1.1' }))).toBe(200);
    expect(await pass(limiter, request({ token: 'a', ip: '2.2.2.2' }))).toBe(200);
    expect(await pass(limiter, request({ token: 'a', ip: '3.3.3.3' }))).toBe(429);
    expect(await pass(limiter, request({ token: 'b', ip: '1.1.1.1' }))).toBe(200);
  });
});
