import { randomUUID } from 'node:crypto';

import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { createTestDb, insertUser, resetDb } from '../../test/db.js';
import { JwtAuthGuard, type AuthedRequest } from './jwt-auth.guard.js';
import { SessionService } from './session.service.js';
import { SESSION_COOKIE } from '@sextante/core/contracts';
import { stub } from '../../test/factories.js';

const SECRET = 'test-secret';

/** Minimal ExecutionContext whose request carries the given cookies. */
function contextWith(cookies: Record<string, string>): {
  ctx: ExecutionContext;
  request: AuthedRequest;
} {
  const request = stub<AuthedRequest>({ cookies });
  const ctx = stub<ExecutionContext>({
    switchToHttp: () => ({ getRequest: () => request }),
  });
  return { ctx, request };
}

describe('JwtAuthGuard (Postgres integration)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let jwt: JwtService;
  let guard: JwtAuthGuard;

  beforeAll(() => {
    ({ db, close } = createTestDb());
    jwt = new JwtService({ secret: SECRET });
    guard = new JwtAuthGuard(new SessionService(jwt, db));
  });

  afterEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await close();
  });

  it('accepts a valid token for an existing user and attaches the token user', async () => {
    const userId = await insertUser(db, 'user@example.com');
    const token = await jwt.signAsync({ sub: userId, email: 'user@example.com' });
    const { ctx, request } = contextWith({ [SESSION_COOKIE]: token });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // The id ALWAYS comes from the verified token, never from the request.
    expect(request.user).toEqual({ id: userId, email: 'user@example.com' });
  });

  it('rejects a valid token whose user no longer exists (dead session)', async () => {
    const token = await jwt.signAsync({ sub: randomUUID(), email: 'ghost@example.com' });
    const { ctx } = contextWith({ [SESSION_COOKIE]: token });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with an invalid signature (different secret)', async () => {
    const forged = await new JwtService({ secret: 'other-secret' }).signAsync({
      sub: randomUUID(),
      email: 'x@example.com',
    });
    const { ctx } = contextWith({ [SESSION_COOKIE]: forged });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when there is no session cookie', async () => {
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
