// Must come FIRST: in ESM imports are evaluated in order, and Nest's decorators write
// metadata through reflect-metadata when the classes are defined.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { mountMcp } from './mcp/mount-mcp.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Runs OnModuleDestroy (closes the Postgres pool).
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Trusted proxy hops (real IP for the rate limit and Secure cookies). In production there can
  // be two (TLS proxy → Next BFF → API); if the middle one rewrites `X-Forwarded-For`, with `1`
  // everyone would share a bucket. Tune it with `TRUST_PROXY_HOPS` based on the diagnostic log
  // of `POST /api/auth/request` (`req.ip` and `X-Forwarded-For`).
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.use(cookieParser());

  // /api fits the same-origin topology (Caddy in prod, Next rewrites in dev).
  app.setGlobalPrefix('api');

  // After cookieParser: /authorize reads the session cookie.
  mountMcp(app);

  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
