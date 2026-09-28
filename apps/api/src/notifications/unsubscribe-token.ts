import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token del enlace de baja de las alertas por email: `<userId>.<firma>`, con la firma un
 * HMAC-SHA256 del `userId`. Lógica pura, testeable.
 *
 * POR QUÉ UN HMAC y no un token aleatorio guardado en BD: la baja tiene que funcionar desde
 * CUALQUIER email que el usuario conserve, también desde uno antiguo. Un token aleatorio
 * obligaría a guardar uno por usuario para siempre o a rotarlo, y rotarlo rompería los enlaces
 * de los emails anteriores. Con un HMAC no hay nada que guardar ni que caduque. Lo peor que
 * permite un enlace filtrado es DESACTIVAR las alertas de ese usuario, que es inocuo.
 *
 * La clave se deriva del secreto de sesión con un prefijo propio, para que una firma de baja
 * no sirva nunca como nada más.
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
  // Comparación en tiempo constante (y con la longitud comprobada antes, que lo exige).
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
