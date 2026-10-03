import { describe, expect, it } from 'vitest';

import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.js';

const USER = '0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f';
const SECRET = 'test-secret';

describe('unsubscribe token', () => {
  it('round-trips: the token verifies and returns the user', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(USER, SECRET), SECRET)).toBe(USER);
  });

  it('is stable: the same user always gets the same token (old emails keep working)', () => {
    expect(createUnsubscribeToken(USER, SECRET)).toBe(createUnsubscribeToken(USER, SECRET));
  });

  it('rejects tampered signatures, another secret or another user', () => {
    const token = createUnsubscribeToken(USER, SECRET);
    const other = '11111111-2222-4333-8444-555555555555';
    expect(verifyUnsubscribeToken(token, 'other-secret')).toBeNull();
    expect(verifyUnsubscribeToken(`${other}${token.slice(USER.length)}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
  });

  it('rejects invalid formats without throwing', () => {
    for (const bad of ['', '.', 'no-dot', `not-a-uuid.${'a'.repeat(43)}`, `${USER}.`]) {
      expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
    }
  });
});
