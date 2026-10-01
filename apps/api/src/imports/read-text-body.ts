import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Lee el cuerpo `text/csv` como UTF-8 con un tope de bytes, cortando en stream (413) en
 * cuanto se supera.
 *
 * Por qué ni multipart ni JSON: los parsers globales de Nest ignoran `text/csv`, así que el
 * tope se aplica solo en esta ruta sin tocar `main.ts`; multipart exigiría `multer` y su
 * superficie de ataque para un único fichero de texto; un JSON obligaría a escapar y cargar
 * hasta 2 MB en un objeto antes de validar. Además `text/csv` no es un tipo "simple" de CORS:
 * un sitio ajeno no puede lanzar la petición con la cookie sin un preflight que la API no autoriza.
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
