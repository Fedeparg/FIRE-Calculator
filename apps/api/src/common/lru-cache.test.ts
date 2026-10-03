import { afterEach, describe, expect, it, vi } from 'vitest';

import { LruCache } from './lru-cache.js';

describe('LruCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns what was stored and undefined when missing', () => {
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('when full, evicts the least recently used entry, not the first inserted', () => {
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // `a` becomes the most recent
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('expires entries after the TTL', () => {
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
