import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads the `text/csv` body as UTF-8 with a byte cap, cutting the stream off (413) as soon as
 * it is exceeded.
 *
 * Why neither multipart nor JSON: Nest's global parsers ignore `text/csv`, so the cap applies
 * only to this route without touching `main.ts`; multipart would require `multer` and its attack
 * surface for a single text file; JSON would force escaping and loading up to 2 MB into an object
 * before validating. Also, `text/csv` is not a CORS "simple" type: a third-party site cannot
 * send the request with the cookie without a preflight the API does not authorize.
 */
export async function readCsvBody(request: Request, maxBytes: number): Promise<string> {
  const contentType = request.headers['content-type'] ?? '';
  if (!/^text\/csv\b/i.test(contentType)) {
    throw new UnsupportedMediaTypeException('El cuerpo debe ser text/csv');
  }

  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeException(`El fichero supera el máximo de ${maxBytes} bytes`);
  }

  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      received += buffer.length;
      if (received > maxBytes) {
        throw new PayloadTooLargeException(`El fichero supera el máximo de ${maxBytes} bytes`);
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('No se pudo leer el cuerpo de la petición');
  }

  if (received === 0) {
    throw new BadRequestException({ code: 'EMPTY_FILE', message: 'El fichero está vacío' });
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
