import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LotAggregateError } from '../positions/lot-aggregate.js';
import { ErrorTranslationFilter } from './error-translation.filter.js';
import { findPgError, pgErrorToHttp } from './pg-error.js';

/** postgres-js error wrapped the way Drizzle does it (`DrizzleQueryError` with `cause`). */
function drizzleError(code: string, constraint?: string): Error {
  const driver = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    constraint_name: constraint,
  });
  return new Error('Failed query: insert into "positions" ... params: secret', { cause: driver });
}

describe('findPgError', () => {
  it('finds the SQLSTATE and the constraint along the cause chain', () => {
    expect(findPgError(drizzleError('23505', 'positions_user_ticker_broker_idx'))).toEqual({
      code: '23505',
      constraint: 'positions_user_ticker_broker_idx',
    });
  });

  it('returns null when there is no Postgres error (or for codes that are not SQLSTATEs)', () => {
    expect(findPgError(new Error('x'))).toBeNull();
    expect(findPgError(Object.assign(new Error('fs'), { code: 'ENOENT' }))).toBeNull();
    expect(findPgError('text')).toBeNull();
  });

  it('does not hang on a circular cause chain', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(findPgError(a)).toBeNull();
  });
});

describe('pgErrorToHttp', () => {
  it('user FK → 401 (session of a deleted user); any other FK → 409', () => {
    expect(pgErrorToHttp(drizzleError('23503', 'positions_user_id_users_id_fk'))).toBeInstanceOf(UnauthorizedException);
    expect(pgErrorToHttp(drizzleError('23503', 'position_lots_position_id_positions_id_fk'))).toBeInstanceOf(
      ConflictException,
    );
  });

  it('unique → 409, out of range → 400, serialisation failure and deadlock → 503', () => {
    expect(pgErrorToHttp(drizzleError('23505'))).toBeInstanceOf(ConflictException);
    expect(pgErrorToHttp(drizzleError('22003'))).toBeInstanceOf(BadRequestException);
    expect(pgErrorToHttp(drizzleError('40001'))).toBeInstanceOf(ServiceUnavailableException);
    expect(pgErrorToHttp(drizzleError('40P01'))).toBeInstanceOf(ServiceUnavailableException);
  });

  it('anything else has no translation (it stays a 500)', () => {
    expect(pgErrorToHttp(drizzleError('42P01'))).toBeNull();
    expect(pgErrorToHttp(new Error('x'))).toBeNull();
  });
});

@Controller('boom')
class BoomController {
  @Get(':kind')
  boom(@Param('kind') kind: string): never {
    if (kind === 'http') throw new NotFoundException({ code: 'NOT_FOUND', message: 'No está' });
    if (kind === 'unique') throw drizzleError('23505', 'positions_user_ticker_broker_idx');
    if (kind === 'domain') throw new LotAggregateError('NEGATIVE_QUANTITY', 'La cantidad quedaría en negativo');
    throw new Error('Failed query: select secret');
  }
}

@Module({ controllers: [BoomController], providers: [{ provide: APP_FILTER, useClass: ErrorTranslationFilter }] })
class BoomModule {}

describe('ErrorTranslationFilter (HTTP)', () => {
  let app: NestExpressApplication;
  let origin: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(BoomModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = async (kind: string) => {
    const res = await fetch(`${origin}/boom/${kind}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('translates a 23505 into a 409 without leaking the Postgres detail', async () => {
    const { status, body } = await get('unique');
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'CONFLICT' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('translates a domain error into a 400 with its code and message', async () => {
    expect(await get('domain')).toEqual({
      status: 400,
      body: { code: 'NEGATIVE_QUANTITY', message: 'La cantidad quedaría en negativo' },
    });
  });

  it('leaves HttpExceptions untouched', async () => {
    expect(await get('http')).toEqual({ status: 404, body: { code: 'NOT_FOUND', message: 'No está' } });
  });

  it('an unknown error stays a generic 500', async () => {
    const { status, body } = await get('other');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
