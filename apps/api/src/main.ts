import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { mountMcp } from './mcp/mount-mcp';

/**
 * Saltos de proxy de confianza por defecto. Se mantiene en 1 (el valor histórico) para no
 * cambiar el comportamiento de un despliegue existente sin que su dueño lo decida.
 */
const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Lee `TRUST_PROXY_HOPS` como entero ≥ 0. Cualquier valor ausente o inválido cae al defecto:
 * un typo en el entorno no debe convertir la API en un proxy "de confianza total" (lo que
 * permitiría a cualquiera falsificar su IP con un `X-Forwarded-For`).
 */
function readTrustProxyHops(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_TRUST_PROXY_HOPS;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Cierre limpio: ejecuta los hooks OnModuleDestroy (cierra el pool de Postgres).
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Detrás de un proxy: confiar en él para obtener la IP real (rate limiting) y las cookies
  // Secure. El número dice CUÁNTOS saltos de confianza hay por delante; Express toma la
  // IP-ésima empezando por la derecha de `X-Forwarded-For`. En producción puede haber dos
  // (reverse proxy TLS → BFF de Next → API) y, si el de en medio reescribe la cabecera en
  // vez de añadir a ella, con `1` todos los usuarios acabarían compartiendo cubo de rate
  // limit. No lo adivinamos: se ajusta con `TRUST_PROXY_HOPS` usando la evidencia del log de
  // diagnóstico de `POST /api/auth/request` (imprime `req.ip` y el `X-Forwarded-For` real).
  app.set('trust proxy', readTrustProxyHops(config.get<string>('TRUST_PROXY_HOPS')));

  // Lee cookies (cookie de sesión JWT).
  app.use(cookieParser());

  // Validación + saneo de DTOs en todas las rutas.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Todas las rutas cuelgan de /api para encajar con la topología same-origin
  // (Caddy en prod / rewrites de Next en dev enrutan /api -> esta API).
  app.setGlobalPrefix('api');

  // Seguridad: en producción, negarse a arrancar con un JWT_SECRET ausente o igual
  // al valor de desarrollo (un secreto público permitiría falsificar sesiones).
  if (config.get<string>('NODE_ENV') === 'production') {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret === 'dev_insecure_secret_change_me') {
      throw new Error(
        'JWT_SECRET no configurado (o usa el valor de desarrollo) en producción. ' +
          'Define uno fuerte: openssl rand -base64 48',
      );
    }
  }

  // Authorization Server OAuth (raíz) + endpoint MCP (/api/mcp). Debe ir tras cookieParser
  // (lee la cookie de sesión en /authorize) y antes de escuchar.
  mountMcp(app);

  const port = Number(config.get('PORT') ?? 3001);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
