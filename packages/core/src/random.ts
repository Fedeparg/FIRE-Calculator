// PRNG con semilla para simulaciones (Monte Carlo): `Math.random` no sirve porque la misma URL debe
// dar el mismo resultado en servidor y cliente, y los tests necesitan valores fijos. No es criptográfico.

export type Rng = () => number;

/** mulberry32: PRNG de 32 bits; la misma semilla da la misma secuencia. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normales N(0, 1) por Box-Muller; la segunda del par se guarda para la siguiente llamada. */
export function normalGenerator(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    // `1 - rng()` está en (0, 1]: evita log(0).
    const u = 1 - rng();
    const v = rng();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** Percentil `p` (0–100) de una muestra ya ordenada, con interpolación lineal (como `PERCENTILE.INC`); NaN si está vacía. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (n - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}
