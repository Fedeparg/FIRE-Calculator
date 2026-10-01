import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it, inject, vi } from 'vitest';

import { POSITION_CREATED_EVENT } from './positions/position-events.js';
import { PortfolioSnapshotsService } from './portfolio/portfolio-snapshots.service.js';

/**
 * `AppModule` se importa en diferido: `ConfigModule.forRoot({ validate })` valida el entorno al
 * evaluar el módulo, y estos tests fijan el suyo en `beforeAll`, es decir, después de los imports.
 */
const loadAppModule = async () => (await import('./app.module.js')).AppModule;

/**
 * Comprueba que la aplicación ARRANCA entera: que el grafo de inyección de dependencias se
 * resuelve y que los hooks de inicio (el registro del cron diario y el backfill de
 * `DailyJobsScheduler.onApplicationBootstrap`) no revientan.
 *
 * No es un test de comportamiento: es la red que atrapa los fallos que solo aparecen al
 * arrancar —un provider no exportado por su módulo, una dependencia circular entre módulos,
 * un token sin registrar— y que ningún test unitario ve, porque cada uno instancia sus
 * servicios a mano. Con el job diario encadenando `PricesModule` y `PortfolioModule`, esa
 * clase de fallo pasó a ser fácil de introducir.
 *
 * Se usa un contexto de aplicación (sin servidor HTTP) para no ocupar puertos, y se cierra
 * al terminar, lo que para los crons registrados. `fetch` se sustituye por un stub: desde que
 * `DailyJobsScheduler.onApplicationBootstrap` backfillea el histórico de precios sin esperar a
 * `listen()`, este test dispararía sin esto una llamada real a Yahoo Finance en cada arranque.
 */
describe('AppModule (arranque de la aplicación)', () => {
  const original = { ...process.env };
  const realFetch = global.fetch;

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
    // El intradía salta a cada media hora: coincidiendo con un test, su lectura se interbloqueaba
    // con el TRUNCATE de `resetDb` (fallo que dependía de la hora a la que corría la suite).
    process.env.PRICE_INTRADAY_CRON = 'off';
  });

  afterAll(() => {
    // No en `afterEach`: `onApplicationBootstrap` dispara `bootstrapBackfill()` sin
    // esperarlo (`void`), así que tras `app.close()` puede seguir en vuelo una consulta a la
    // BD que, al resolver, llame a `fetch`. Restaurarlo antes de eso reabriría la ventana a
    // una llamada real a Yahoo que este test existe para eliminar.
    global.fetch = realFetch;
    process.env = original;
  });

  it('resuelve todos los módulos y providers de la aplicación', async () => {
    // Sin stub, `YahooPriceProvider.fetchChart` golpearía la red real en cuanto el backfill
    // de arranque se dispare (ver comentario del `describe`). Rechazar sin más: el propio
    // provider ya es tolerante a fallos (ver `price-provider.interface.ts`).
    global.fetch = vi.fn().mockRejectedValue(new Error('red deshabilitada en este test'));

    // `abortOnError: false`: por defecto Nest hace `process.exit(1)` ante un fallo de
    // arranque, lo que mataría el worker de Vitest sin decir por qué. Así lanza y se ve.
    const app = await NestFactory.createApplicationContext(await loadAppModule(), {
      abortOnError: false,
      logger: false,
    });

    // Si el grafo tuviese un ciclo o faltase un `exports`, la línea anterior habría lanzado.
    expect(app).toBeDefined();
    await app.close();
  });

  it('el evento position.created SÍ llega a @OnEvent bajo el arranque real de Nest', async () => {
    // A diferencia de los tests de `PortfolioSnapshotsService`/`PositionsService` (que
    // instancian los servicios con `new` y por tanto nunca pasan por el `DiscoveryService`
    // de Nest), aquí el `EventEmitter2` y el listener decorado con `@OnEvent` vienen del
    // MISMO contenedor de `AppModule`: es la única prueba de que el cableado del evento
    // (`EventEmitterModule.forRoot()` + `@OnEvent(POSITION_CREATED_EVENT)`, ver
    // `positions/position-events.ts`) funciona de verdad, no solo que el cuerpo del método
    // funciona si lo llamas a mano.
    global.fetch = vi.fn().mockRejectedValue(new Error('red deshabilitada en este test'));

    const app = await NestFactory.createApplicationContext(await loadAppModule(), {
      abortOnError: false,
      logger: false,
    });

    const snapshots = app.get(PortfolioSnapshotsService);
    const backfillUser = vi.spyOn(snapshots, 'backfillUser').mockResolvedValue(undefined);
    const emitter = app.get(EventEmitter2);

    await emitter.emitAsync(POSITION_CREATED_EVENT, { userId: 'evento-de-prueba' });

    expect(backfillUser).toHaveBeenCalledWith('evento-de-prueba');
    await app.close();
  });
});
