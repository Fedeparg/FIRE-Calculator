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

/** Minimal request with the only things the limiters look at (headers, the IP resolved by Express and `auth`). */
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
 * Runs a request through a real `express-rate-limit` limiter with a minimal response and returns
 * the status: 429 if it blocked it, 200 if it called `next()`.
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
      error ? reject(new Error('The limiter called next() with an error', { cause: error })) : resolve();
    void Promise.resolve(limiter(req, stub<Response>(res), next)).then(() => resolve(), reject);
  });
  return status;
}

describe('mcpIpRateLimitKey', () => {
  it('uses the IP, not the Authorization header', () => {
    expect(mcpIpRateLimitKey(request({ ip: '203.0.113.7', authorization: 'Bearer x' }))).toBe('ip:203.0.113.7');
  });

  it('groups IPv6 addresses by /64 subnet (rotating addresses does not dodge the limit)', () => {
    const first = mcpIpRateLimitKey(request({ ip: '2001:db8:1234:5678:1111:2222:3333:4444' }));
    const second = mcpIpRateLimitKey(request({ ip: '2001:db8:1234:5678:9999:8888:7777:6666' }));

    expect(first).toBe(second);
  });

  it('never returns an empty key even without an IP', () => {
    expect(mcpIpRateLimitKey(request({}))).toBe('ip:unknown');
  });
});

describe('mcpTokenRateLimitKey', () => {
  it('uses the hash of the VERIFIED token, not the plain token', () => {
    const key = mcpTokenRateLimitKey(request({ token: 'secreto-en-claro' }));

    expect(key).toBe(`token:${sha256('secreto-en-claro')}`);
    expect(key).not.toContain('secreto-en-claro');
  });

  it('ignores the Authorization header: without a verified token it falls back to the IP', () => {
    expect(mcpTokenRateLimitKey(request({ authorization: 'Bearer cualquiera', ip: '10.0.0.1' }))).toBe('ip:10.0.0.1');
  });

  it('puts the same token in the same bucket across IPs, and separates different tokens', () => {
    const first = mcpTokenRateLimitKey(request({ token: 't', ip: '1.2.3.4' }));
    const second = mcpTokenRateLimitKey(request({ token: 't', ip: '5.6.7.8' }));
    const other = mcpTokenRateLimitKey(request({ token: 'u', ip: '1.2.3.4' }));

    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });
});

describe('MCP endpoint limiters', () => {
  it('the IP limiter blocks a client rotating junk Bearers on every request', async () => {
    const limiter = createMcpIpRateLimiter(3);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const junk = `Bearer ${randomBytes(16).toString('hex')}`;
      statuses.push(await pass(limiter, request({ authorization: junk, ip: '198.51.100.9' })));
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('the token limiter counts by verified identity, regardless of the IP', async () => {
    const limiter = createMcpTokenRateLimiter(2);

    expect(await pass(limiter, request({ token: 'a', ip: '1.1.1.1' }))).toBe(200);
    expect(await pass(limiter, request({ token: 'a', ip: '2.2.2.2' }))).toBe(200);
    expect(await pass(limiter, request({ token: 'a', ip: '3.3.3.3' }))).toBe(429);
    expect(await pass(limiter, request({ token: 'b', ip: '1.1.1.1' }))).toBe(200);
  });
});
