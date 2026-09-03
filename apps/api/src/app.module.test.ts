import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { AppModule } from './app.module.js';

/**
 * Comprueba que la aplicación ARRANCA entera: que el grafo de inyección de dependencias se
 * resuelve y que los hooks de inicio (el registro del cron diario) no revientan.
 *
 * No es un test de comportamiento: es la red que atrapa los fallos que solo aparecen al
 * arrancar —un provider no exportado por su módulo, una dependencia circular entre módulos,
 * un token sin registrar— y que ningún test unitario ve, porque cada uno instancia sus
 * servicios a mano. Con el job diario encadenando `PricesModule` y `PortfolioModule`, esa
 * clase de fallo pasó a ser fácil de introducir.
 *
 * Se usa un contexto de aplicación (sin servidor HTTP) para no ocupar puertos, y se cierra
 * al terminar, lo que para los crons registrados.
 */
describe('AppModule (arranque de la aplicación)', () => {
  const original = { ...process.env };

  beforeAll(() => {
    // Entorno mínimo para arrancar: la BD efímera de Testcontainers y el secreto del JWT.
    // Se fija aquí, y no se hereda del `.env` local, para que el test valga igual en CI.
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_SECRET = 'test-secret-para-el-grafo-de-dependencias';
    process.env.EMAIL_TRANSPORT = 'dev';
    process.env.EMAIL_FROM = 'Sextante <no-reply@example.test>';
    // Base del issuer OAuth (`OAuthUrls` la exige); cualquier origen válido sirve aquí.
    process.env.APP_URL = 'https://sextante.example.test';
    // Un cron que no llega a dispararse durante el test (29 de febrero de un año no bisiesto
    // no existe; basta con una fecha lejana): solo interesa que se REGISTRE sin error.
    process.env.PRICE_REFRESH_CRON = '0 0 4 1 1 *';
  });

  afterAll(() => {
    process.env = original;
  });

  it('resuelve todos los módulos y providers de la aplicación', async () => {
    // `abortOnError: false`: por defecto Nest hace `process.exit(1)` ante un fallo de
    // arranque, lo que mataría el worker de Vitest sin decir por qué. Así lanza y se ve.
    const app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });

    // Si el grafo tuviese un ciclo o faltase un `exports`, la línea anterior habría lanzado.
    expect(app).toBeDefined();
    await app.close();
  });
});
