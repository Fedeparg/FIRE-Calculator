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

/** Error de postgres-js envuelto como lo hace Drizzle (`DrizzleQueryError` con `cause`). */
function drizzleError(code: string, constraint?: string): Error {
  const driver = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    constraint_name: constraint,
  });
  return new Error('Failed query: insert into "positions" ... params: secreto', { cause: driver });
}

describe('findPgError', () => {
  it('encuentra el SQLSTATE y la restricción en la cadena de cause', () => {
    expect(findPgError(drizzleError('23505', 'positions_user_ticker_broker_idx'))).toEqual({
      code: '23505',
      constraint: 'positions_user_ticker_broker_idx',
    });
  });

  it('devuelve null si no hay error de Postgres (ni códigos que no son SQLSTATE)', () => {
    expect(findPgError(new Error('x'))).toBeNull();
    expect(findPgError(Object.assign(new Error('fs'), { code: 'ENOENT' }))).toBeNull();
    expect(findPgError('texto')).toBeNull();
  });

  it('no se cuelga con una cadena de cause circular', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(findPgError(a)).toBeNull();
  });
});

describe('pgErrorToHttp', () => {
  it('FK del usuario → 401 (sesión de un usuario borrado); otra FK → 409', () => {
    expect(pgErrorToHttp(drizzleError('23503', 'positions_user_id_users_id_fk'))).toBeInstanceOf(UnauthorizedException);
    expect(pgErrorToHttp(drizzleError('23503', 'position_lots_position_id_positions_id_fk'))).toBeInstanceOf(
      ConflictException,
    );
  });

  it('único → 409, fuera de rango → 400, serialización e interbloqueo → 503', () => {
    expect(pgErrorToHttp(drizzleError('23505'))).toBeInstanceOf(ConflictException);
    expect(pgErrorToHttp(drizzleError('22003'))).toBeInstanceOf(BadRequestException);
    expect(pgErrorToHttp(drizzleError('40001'))).toBeInstanceOf(ServiceUnavailableException);
    expect(pgErrorToHttp(drizzleError('40P01'))).toBeInstanceOf(ServiceUnavailableException);
  });

  it('el resto no tiene traducción (sigue siendo un 500)', () => {
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
    throw new Error('Failed query: select secreto');
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

  it('traduce un 23505 a 409 sin volcar el detalle de Postgres', async () => {
    const { status, body } = await get('unique');
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'CONFLICT' });
    expect(JSON.stringify(body)).not.toContain('secreto');
  });

  it('traduce un error de dominio a 400 con su código y su mensaje', async () => {
    expect(await get('domain')).toEqual({
      status: 400,
      body: { code: 'NEGATIVE_QUANTITY', message: 'La cantidad quedaría en negativo' },
    });
  });

  it('deja intactas las HttpException', async () => {
    expect(await get('http')).toEqual({ status: 404, body: { code: 'NOT_FOUND', message: 'No está' } });
  });

  it('un error desconocido sigue siendo un 500 genérico', async () => {
    const { status, body } = await get('other');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secreto');
  });
});
