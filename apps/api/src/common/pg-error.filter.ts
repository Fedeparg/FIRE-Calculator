import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { pgErrorToHttp } from './pg-error.js';

/**
 * Filtro global (registrado con `APP_FILTER`): traduce los errores de Postgres con significado
 * para el cliente (FK, único, rango, concurrencia; ver `pgErrorToHttp`) a su respuesta HTTP, en
 * vez de un 500. Las `HttpException` y cualquier otro error siguen el camino por defecto de Nest
 * (`BaseExceptionFilter`), así que las respuestas ya existentes no cambian.
 */
@Catch()
export class PgErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const mapped = exception instanceof HttpException ? null : pgErrorToHttp(exception);
    super.catch(mapped ?? exception, host);
  }
}
