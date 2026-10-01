import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Lee el cuerpo de una petición `text/csv` como UTF-8, con un tope de bytes.
 *
 * POR QUÉ NO multipart NI JSON:
 *  - Los parsers globales de Nest (JSON/urlencoded, 100 kB por defecto) ignoran `text/csv`, así
 *    que el cuerpo llega intacto al handler y el tope se aplica AQUÍ, solo en esta ruta: no hace
 *    falta tocar `main.ts` ni subir el límite global de todas las demás.
 *  - Multipart exigiría `multer` (hoy solo transitiva, sin rutas de subida) y su superficie de
 *    ataque (parseo de partes, ficheros temporales) para recibir un único fichero de texto.
 *  - Un JSON `{ "csv": "…" }` obligaría a escapar el CSV entero en el cliente y a cargar un
 *    `string` de hasta 2 MB dentro de un objeto antes de poder validarlo.
 *  - `text/csv` no es un tipo "simple" de CORS, así que un sitio ajeno no puede lanzar esta
 *    petición con la cookie de sesión sin pasar por un preflight que la API no autoriza.
 *
 * El corte es EN STREAM: en cuanto se supera el tope se deja de acumular y se responde 413,
 * sin esperar a que termine de subirse un fichero enorme.
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
