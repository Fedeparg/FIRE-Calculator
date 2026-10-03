import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { DomainError, domainErrorToHttp } from './domain-error.js';
import { pgErrorToHttp } from './pg-error.js';

/**
 * Global filter (registered with `APP_FILTER`): translates into their HTTP response, instead of a
 * 500, the errors that mean something to the client but are not born as an `HttpException`:
 *  - domain errors (`DomainError`, e.g. a lot that leaves the quantity negative) → 400;
 *  - Postgres errors (FK, unique, range, concurrency; see `pgErrorToHttp`).
 * `HttpException`s and any other error follow Nest's default path (`BaseExceptionFilter`), so
 * existing responses do not change.
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
