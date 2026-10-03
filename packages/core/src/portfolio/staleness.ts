import { itemAt } from "../arrays.js";
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
    while (next < lotsByDate.length && itemAt(lotsByDate, next).tradedAt <= snapshot.date) {
      latestChange = Math.max(latestChange, itemAt(lotsByDate, next).changedAt);
      next += 1;
    }
    if (latestChange > snapshot.writtenAt || (invalidateFrom !== null && snapshot.date >= invalidateFrom)) {
      stale.add(snapshot.date);
    }
  }
  return stale;
}

/** Valores de un día del histórico, tal como se guardan (`numeric` como texto, tasas FX del día). */
export interface SnapshotValues {
  /** Fecha, YYYY-MM-DD. */
  date: string;
  invested: string;
  marketValue: string;
  valuedPositions: number;
  totalPositions: number;
  fxRates: Record<string, number>;
}

/** Fila ya guardada: los valores y si es una estimación (reconstruida) o una captura real. */
export interface StoredSnapshot extends SnapshotValues {
  estimated: boolean;
}

export interface SnapshotWritePlanInput<Row extends SnapshotValues> {
  /** Días que sale de la reconstrucción, sin la marca `estimated` (la pone el plan). */
  rows: readonly Row[];
  /** Lo que ya hay guardado del usuario. */
  existing: readonly StoredSnapshot[];
  /** Capturas reales obsoletas (`staleSnapshotDates`): las únicas reales que se pueden pisar. */
  staleReal: ReadonlySet<string>;
  /** Inicio del seguimiento en Sextante (YYYY-MM-DD): antes, cada día es una estimación. */
  trackingSince: string;
}

export interface SnapshotWritePlan<Row extends SnapshotValues> {
  /** Filas a escribir (upsert), ya con `estimated = date < trackingSince`. */
  changed: (Row & { estimated: boolean })[];
  /** Fechas de estimaciones guardadas que ya no salen de la reconstrucción: se retiran. */
  stale: string[];
}

/** Igualdad de tasas FX (un `jsonb` no conserva el orden de las claves). */
function sameRates(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Qué escribir tras reconstruir el histórico de un usuario: solo la diferencia con lo guardado
 * (reescribir ~1.800 filas idénticas cada noche no aporta nada). Core puro.
 *
 * - Un día sin fila guardada se escribe.
 * - Una captura REAL solo se sustituye si está obsoleta (`staleReal`).
 * - Una ESTIMACIÓN se reescribe si cambia algún valor o si su `estimated` ya no cumple la regla
 *   (reparación automática).
 * - Las estimaciones guardadas que ya no salen de la reconstrucción (operación borrada...) se
 *   retiran; las reales nunca.
 */
export function planSnapshotWrites<Row extends SnapshotValues>(
  input: SnapshotWritePlanInput<Row>,
): SnapshotWritePlan<Row> {
  const { rows, existing, staleReal, trackingSince } = input;
  const existingByDate = new Map(existing.map((row) => [row.date, row]));
  const newDates = new Set(rows.map((row) => row.date));

  const changed = rows
    .map((row) => ({ ...row, estimated: row.date < trackingSince }))
    .filter((row) => {
      const current = existingByDate.get(row.date);
      if (!current) return true;
      if (!current.estimated) return staleReal.has(row.date);
      return !(
        current.estimated === row.estimated &&
        current.invested === row.invested &&
        current.marketValue === row.marketValue &&
        current.valuedPositions === row.valuedPositions &&
        current.totalPositions === row.totalPositions &&
        sameRates(current.fxRates, row.fxRates)
      );
    });
  const stale = existing.filter((row) => row.estimated && !newDates.has(row.date)).map((row) => row.date);
  return { changed, stale };
}
