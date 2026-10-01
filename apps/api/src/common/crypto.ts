import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 en hexadecimal. Es lo que se guarda en BD de tokens y credenciales: cambiarlo invalidaría los ya emitidos. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token opaco de 256 bits aleatorios en base64url (apto para URLs y cabeceras). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
