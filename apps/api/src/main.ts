// Debe ir PRIMERO: en ESM los imports se evalúan en orden y los decoradores de Nest
// escriben metadata vía reflect-metadata al definirse las clases.
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

  // Ejecuta OnModuleDestroy (cierra el pool de Postgres).
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Saltos de proxy de confianza (IP real para el rate limit y cookies Secure). En producción
  // puede haber dos (proxy TLS → BFF de Next → API); si el de en medio reescribe
  // `X-Forwarded-For`, con `1` todos compartirían cubo. Se ajusta con `TRUST_PROXY_HOPS` según
  // el log de diagnóstico de `POST /api/auth/request` (`req.ip` y `X-Forwarded-For`).
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.use(cookieParser());

  // /api encaja con la topología same-origin (Caddy en prod, rewrites de Next en dev).
  app.setGlobalPrefix('api');

  // Tras cookieParser: /authorize lee la cookie de sesión.
  mountMcp(app);

  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
