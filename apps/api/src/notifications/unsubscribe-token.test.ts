import { describe, expect, it } from 'vitest';

import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.js';

const USER = '0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f';
const SECRET = 'test-secret';

describe('unsubscribe token', () => {
  it('ida y vuelta: el token verifica y devuelve el usuario', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(USER, SECRET), SECRET)).toBe(USER);
  });

  it('es estable: el mismo usuario siempre da el mismo token (los emails antiguos siguen valiendo)', () => {
    expect(createUnsubscribeToken(USER, SECRET)).toBe(createUnsubscribeToken(USER, SECRET));
  });

  it('rechaza firmas manipuladas, otro secreto u otro usuario', () => {
    const token = createUnsubscribeToken(USER, SECRET);
    const other = '11111111-2222-4333-8444-555555555555';
    expect(verifyUnsubscribeToken(token, 'otro-secreto')).toBeNull();
    expect(verifyUnsubscribeToken(`${other}${token.slice(USER.length)}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
  });

  it('rechaza formatos inválidos sin lanzar', () => {
    for (const bad of ['', '.', 'sin-punto', `no-es-uuid.${'a'.repeat(43)}`, `${USER}.`]) {
      expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
    }
  });
});
