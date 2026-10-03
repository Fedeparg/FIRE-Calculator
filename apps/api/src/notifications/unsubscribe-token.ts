import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Unsubscribe link token: `<userId>.<HMAC-SHA256 of the userId>`. HMAC rather than a random token in
 * the DB: unsubscribing must work from any old email, and storing or rotating tokens would break links.
 * A leaked link only allows disabling that user's alerts. The key is derived from the session secret
 * with its own prefix, so the signature is useless for anything else.
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

/** The token's `userId` if the signature is valid; `null` otherwise. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  if (!UUID.test(userId)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, secret));
  // Constant time; `timingSafeEqual` requires equal lengths.
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
