import { compareStrings } from "../compare.js";
/**
 * Capturas reales del histórico de la cartera que han quedado obsoletas. Core puro.
 *
 * Una captura de fecha `D` escrita en `W` está obsoleta si existe un lote con `tradedAt <= D` cuyo
 * último cambio es posterior a `W` (p. ej. se importó una operación con fecha anterior): si no, la
 * serie mostraría un escalón falso. Los lotes borrados no dejan marca: el llamante pasa
 * `invalidateFrom` y se invalidan las capturas con fecha `>= invalidateFrom`.
 */

export interface StalenessLot {
  /** Fecha de la operación, YYYY-MM-DD. */
  tradedAt: string;
  /** Último cambio del lote (creación o edición), en milisegundos desde epoch. */
  changedAt: number;
}

/** Captura real reducida a lo que importa para la regla. */
export interface StalenessSnapshot {
  /** Fecha de la captura, YYYY-MM-DD. */
  date: string;
  /** Instante en que se escribió la captura, en milisegundos desde epoch. */
  writtenAt: number;
}

export interface StalenessInput {
  snapshots: readonly StalenessSnapshot[];
  lots: readonly StalenessLot[];
  /** Fecha desde la que todo se da por obsoleto (lote borrado o movido); `null` si no aplica. */
  invalidateFrom?: string | null;
}

const byDate = (a: string, b: string): number => compareStrings(a, b);

/** Fechas (YYYY-MM-DD) de las capturas obsoletas, en O(n log n). */
export function staleSnapshotDates(input: StalenessInput): Set<string> {
  const { snapshots, lots, invalidateFrom = null } = input;
  const stale = new Set<string>();

  const lotsByDate = [...lots].sort((a, b) => byDate(a.tradedAt, b.tradedAt));
  const snapshotsByDate = [...snapshots].sort((a, b) => byDate(a.date, b.date));

  // Cambio más reciente entre los lotes con `tradedAt <= fecha de la captura`.
  let latestChange = Number.NEGATIVE_INFINITY;
  let next = 0;
  for (const snapshot of snapshotsByDate) {
    while (next < lotsByDate.length && lotsByDate[next].tradedAt <= snapshot.date) {
      latestChange = Math.max(latestChange, lotsByDate[next].changedAt);
      next += 1;
    }
    if (latestChange > snapshot.writtenAt || (invalidateFrom !== null && snapshot.date >= invalidateFrom)) {
      stale.add(snapshot.date);
    }
  }
  return stale;
}
