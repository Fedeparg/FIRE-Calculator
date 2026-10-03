/**
 * In-memory cache with a maximum size (evicts the least recently used entry) and per-entry expiry.
 * It relies on a `Map` keeping insertion order: re-inserting on read moves the key to the end, so
 * the first key is always the least recent. Per process, with no coordination between replicas
 * (the API runs as a single one).
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (Date.now() >= entry.expiresAt) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }
}
