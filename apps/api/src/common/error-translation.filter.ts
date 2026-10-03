import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { DomainError, domainErrorToHttp } from './domain-error.js';
import { pgErrorToHttp } from './pg-error.js';

/**
 * Filtro global (registrado con `APP_FILTER`): traduce a su respuesta HTTP, en vez de un 500,
 * los errores que tienen significado para el cliente pero no nacen como `HttpException`:
 *  - los de dominio (`DomainError`, p. ej. un lote que deja la cantidad en negativo) → 400;
 *  - los de Postgres (FK, único, rango, concurrencia; ver `pgErrorToHttp`).
 * Las `HttpException` y cualquier otro error siguen el camino por defecto de Nest
 * (`BaseExceptionFilter`), así que las respuestas ya existentes no cambian.
 */
@Catch()
export class ErrorTranslationFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(translate(exception) ?? exception, host);
  }
}

function translate(exception: unknown): HttpException | null {
  if (exception instanceof HttpException) return null;
  if (exception instanceof DomainError) return domainErrorToHttp(exception);
  return pgErrorToHttp(exception);
}
