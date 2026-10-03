import { createHash, randomBytes } from 'node:crypto';

/** Hex SHA-256. It is what the DB stores for tokens and credentials: changing it would invalidate those already issued. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Opaque token of 256 random bits in base64url (safe for URLs and headers). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
