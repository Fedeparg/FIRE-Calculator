// Seeded PRNG for simulations (Monte Carlo): `Math.random` will not do because the same URL must
// give the same result on server and client, and tests need fixed values. Not cryptographic.

import { itemAt } from "./arrays.js";

export type Rng = () => number;

/** mulberry32: 32-bit PRNG; the same seed gives the same sequence. */
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

/** N(0, 1) normals via Box-Muller; the second of each pair is kept for the next call. */
export function normalGenerator(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    // `1 - rng()` is in (0, 1]: avoids log(0).
    const u = 1 - rng();
    const v = rng();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** Percentile `p` (0–100) of an already sorted sample, linearly interpolated (like `PERCENTILE.INC`); NaN if empty. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return itemAt(sorted, 0);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (n - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  // `rank` is in [0, n − 1], so `low` and `high` are valid indices.
  const lowValue = itemAt(sorted, low);
  return lowValue + (itemAt(sorted, high) - lowValue) * (rank - low);
}
