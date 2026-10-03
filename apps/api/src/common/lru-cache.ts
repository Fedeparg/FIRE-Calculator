/**
 * Caché en memoria con tamaño máximo (expulsa la entrada usada hace más tiempo) y caducidad por
 * entrada. Se apoya en que un `Map` conserva el orden de inserción: reinsertar al leer mueve la
 * clave al final, así que la primera clave es siempre la menos reciente. Por proceso, sin
 * coordinación entre réplicas (la API corre en una sola).
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
