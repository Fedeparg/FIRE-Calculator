import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token del enlace de baja: `<userId>.<HMAC-SHA256 del userId>`. HMAC y no token aleatorio en BD:
 * la baja debe funcionar desde cualquier email antiguo, y guardar o rotar tokens rompería enlaces.
 * Un enlace filtrado solo permite desactivar las alertas de ese usuario. La clave se deriva del
 * secreto de sesión con prefijo propio, para que la firma no sirva para nada más.
 */
const KEY_CONTEXT = 'sextante:unsubscribe:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`${KEY_CONTEXT}:${secret}`).digest();
}

function sign(userId: string, secret: string): string {
  return createHmac('sha256', deriveKey(secret)).update(userId).digest('base64url');
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** `userId` del token si la firma es válida; `null` en cualquier otro caso. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  if (!UUID.test(userId)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, secret));
  // Tiempo constante; `timingSafeEqual` exige longitudes iguales.
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
