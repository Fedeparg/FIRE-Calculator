import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valida (y transforma: trim, coerción de query params) la entrada de un `@Body()` o `@Query()`
 * con un esquema zod. Es la única vía de validación de la API: los mismos esquemas los reutilizan
 * las tools de escritura de MCP, de modo que REST y MCP no pueden aceptar cosas distintas.
 *
 * Responde 400 con la forma de siempre de Nest (`{ statusCode, error, message: string[] }`); cada
 * mensaje lleva la ruta del campo. El front solo mira el estado, así que el texto es para depurar.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(describeIssues(result.error));
    return result.data;
  }
}

/** Un mensaje por incidencia, con la ruta del campo si la hay (`quantity: ...`). */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
}
