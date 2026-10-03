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

/** ExecutionContext mínimo cuyo request lleva las cookies dadas. */
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

describe('JwtAuthGuard (integración con Postgres)', () => {
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

  it('acepta un token válido de un usuario existente y adjunta el usuario del token', async () => {
    const userId = await insertUser(db, 'user@example.com');
    const token = await jwt.signAsync({ sub: userId, email: 'user@example.com' });
    const { ctx, request } = contextWith({ [SESSION_COOKIE]: token });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // El id SIEMPRE sale del token verificado, nunca de la petición.
    expect(request.user).toEqual({ id: userId, email: 'user@example.com' });
  });

  it('rechaza un token válido cuyo usuario ya no existe (sesión muerta)', async () => {
    const token = await jwt.signAsync({ sub: randomUUID(), email: 'ghost@example.com' });
    const { ctx } = contextWith({ [SESSION_COOKIE]: token });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token con firma inválida (otro secreto)', async () => {
    const forged = await new JwtService({ secret: 'otro-secreto' }).signAsync({
      sub: randomUUID(),
      email: 'x@example.com',
    });
    const { ctx } = contextWith({ [SESSION_COOKIE]: forged });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza si no hay cookie de sesión', async () => {
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
