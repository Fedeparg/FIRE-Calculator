import { createHash } from 'node:crypto';

import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { mcpRateLimitKey } from './mcp-rate-limit.js';

/** Petición mínima con lo único que mira la función (cabeceras + IP resuelta por Express). */
function request(opts: { authorization?: string; ip?: string }): Request {
  return {
    headers: opts.authorization ? { authorization: opts.authorization } : {},
    ip: opts.ip,
  } as unknown as Request;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('mcpRateLimitKey', () => {
  it('usa el hash del Bearer como identidad, no el token en claro', () => {
    const key = mcpRateLimitKey(request({ authorization: 'Bearer secreto-en-claro' }));

    expect(key).toBe(`token:${sha256('secreto-en-claro')}`);
    expect(key).not.toContain('secreto-en-claro');
  });

  it('separa a dos tokens distintos en cubos distintos', () => {
    const a = mcpRateLimitKey(request({ authorization: 'Bearer token-a' }));
    const b = mcpRateLimitKey(request({ authorization: 'Bearer token-b' }));

    expect(a).not.toBe(b);
  });

  it('mete al mismo token en el mismo cubo aunque cambie de IP', () => {
    const first = mcpRateLimitKey(request({ authorization: 'Bearer t', ip: '1.2.3.4' }));
    const second = mcpRateLimitKey(request({ authorization: 'Bearer t', ip: '5.6.7.8' }));

    expect(first).toBe(second);
  });

  it('acepta el esquema en cualquier caja y con espacios de más', () => {
    const canonical = mcpRateLimitKey(request({ authorization: 'Bearer t' }));

    expect(mcpRateLimitKey(request({ authorization: 'bearer t' }))).toBe(canonical);
    expect(mcpRateLimitKey(request({ authorization: 'BEARER   t' }))).toBe(canonical);
  });

  it('cae a la IP cuando no hay Bearer (petición de descubrimiento)', () => {
    expect(mcpRateLimitKey(request({ ip: '203.0.113.7' }))).toBe('ip:203.0.113.7');
  });

  it('cae a la IP si el Authorization no es un Bearer válido', () => {
    expect(mcpRateLimitKey(request({ authorization: 'Basic dXNlcjpwYXNz', ip: '10.0.0.1' }))).toBe('ip:10.0.0.1');
    expect(mcpRateLimitKey(request({ authorization: 'Bearer', ip: '10.0.0.1' }))).toBe('ip:10.0.0.1');
  });

  it('agrupa las IPv6 por subred /64 (rotar de dirección no burla el límite)', () => {
    const first = mcpRateLimitKey(request({ ip: '2001:db8:1234:5678:1111:2222:3333:4444' }));
    const second = mcpRateLimitKey(request({ ip: '2001:db8:1234:5678:9999:8888:7777:6666' }));

    expect(first).toBe(second);
  });

  it('nunca devuelve una clave vacía aunque falte la IP', () => {
    expect(mcpRateLimitKey(request({}))).toBe('ip:unknown');
  });
});
