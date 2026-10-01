// Debe ir PRIMERO: en ESM los imports se evalúan en orden y los decoradores de Nest
// escriben metadata vía reflect-metadata al definirse las clases.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module.js';
import { mountMcp } from './mcp/mount-mcp.js';

/** Saltos de proxy de confianza por defecto. */
const DEFAULT_TRUST_PROXY_HOPS = 1;

/** `TRUST_PROXY_HOPS` como entero ≥ 0; ausente o inválido cae al defecto (un typo no debe confiar en todo `X-Forwarded-For`). */
function readTrustProxyHops(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_TRUST_PROXY_HOPS;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Ejecuta OnModuleDestroy (cierra el pool de Postgres).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Saltos de proxy de confianza (IP real para el rate limit y cookies Secure). En producción
  // puede haber dos (proxy TLS → BFF de Next → API); si el de en medio reescribe
  // `X-Forwarded-For`, con `1` todos compartirían cubo. Se ajusta con `TRUST_PROXY_HOPS` según
  // el log de diagnóstico de `POST /api/auth/request` (`req.ip` y `X-Forwarded-For`).
  app.set('trust proxy', readTrustProxyHops(config.get<string>('TRUST_PROXY_HOPS')));

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // /api encaja con la topología same-origin (Caddy en prod, rewrites de Next en dev).
  app.setGlobalPrefix('api');

  // En producción no arrancar sin JWT_SECRET o con el de desarrollo (permitiría falsificar sesiones).
  if (config.get<string>('NODE_ENV') === 'production') {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret === 'dev_insecure_secret_change_me') {
      throw new Error(
        'JWT_SECRET no configurado (o usa el valor de desarrollo) en producción. ' +
          'Define uno fuerte: openssl rand -base64 48',
      );
    }
  }

  // Tras cookieParser: /authorize lee la cookie de sesión.
  mountMcp(app);

  const port = Number(config.get('PORT') ?? 3001);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
