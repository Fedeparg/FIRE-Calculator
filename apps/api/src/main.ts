import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Cierre limpio: ejecuta los hooks OnModuleDestroy (cierra el pool de Postgres).
  app.enableShutdownHooks();

  // Todas las rutas cuelgan de /api para encajar con la topología same-origin
  // (Caddy en prod / rewrites de Next en dev enrutan /api -> esta API).
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT') ?? 3001);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
