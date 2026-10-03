import { afterEach, describe, expect, it, vi } from 'vitest';

import { LruCache } from './lru-cache.js';

describe('LruCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve lo guardado y undefined si no está', () => {
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('al llenarse expulsa la entrada usada hace más tiempo, no la insertada antes', () => {
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // `a` pasa a ser la más reciente
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('caduca las entradas pasado el TTL', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);

    vi.setSystemTime(999);
    expect(cache.get('a')).toBe(1);
    vi.setSystemTime(2_000);
    expect(cache.get('a')).toBeUndefined();
  });
});
