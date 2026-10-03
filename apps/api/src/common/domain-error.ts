import { BadRequestException, type HttpException } from '@nestjs/common';

/**
 * Error from a domain rule that the CLIENT can fix (e.g. selling more than is held). The logic
 * throws it without knowing anything about HTTP, with a stable `code` and a user-readable message;
 * the translation into a response happens in a single place, at the edge: the global filter for
 * REST (`ErrorTranslationFilter`) and `ToolRunner` for MCP. That way whoever catches it (e.g. the
 * import) checks `instanceof` instead of reinterpreting the body of a 400.
 *
 * Its message reaches the user verbatim: it must not carry internal data.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

/** A domain error is an invalid request: 400 with `{ code, message }`. */
export function domainErrorToHttp(error: DomainError): HttpException {
  return new BadRequestException({ code: error.code, message: error.message });
}
