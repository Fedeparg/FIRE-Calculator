import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Cierre limpio: ejecuta los hooks OnModuleDestroy (cierra el pool de Postgres).
  app.enableShutdownHooks();

  // Detrás de un proxy (Next rewrites / Cloudflare / reverse proxy): confiar en él
  // para obtener la IP real (rate limiting) y las cookies Secure.
  app.set('trust proxy', 1);

  // Lee cookies (cookie de sesión JWT).
  app.use(cookieParser());

  // Validación + saneo de DTOs en todas las rutas.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Todas las rutas cuelgan de /api para encajar con la topología same-origin
  // (Caddy en prod / rewrites de Next en dev enrutan /api -> esta API).
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);

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

  const port = Number(config.get('PORT') ?? 3001);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
