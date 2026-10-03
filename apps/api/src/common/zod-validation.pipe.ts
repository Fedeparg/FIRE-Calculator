import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates (and transforms: trim, query param coercion) the input of a `@Body()` or `@Query()`
 * with a zod schema. It is the API's only validation path: the MCP write tools reuse the same
 * schemas, so REST and MCP cannot accept different things.
 *
 * Responds 400 with Nest's usual shape (`{ statusCode, error, message: string[] }`); each message
 * carries the field path. The frontend only looks at the status, so the text is for debugging.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(describeIssues(result.error));
    return result.data;
  }
}

/** One message per issue, prefixed with the field path if there is one (`quantity: ...`). */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
}
