/**
 * Qué capturas REALES del histórico de la cartera han quedado obsoletas. Core puro (sin BD),
 * testeable.
 *
 * Una captura real (la del cron) valora la cartera tal como estaba REGISTRADA en el momento de
 * hacerla. Si después se registra una operación con fecha anterior a esa captura (importar el
 * historial de un bróker, corregir una fecha), la captura no incluye esa operación y la serie
 * muestra un escalón falso justo donde acaba la parte reconstruida.
 *
 * REGLA: una captura de fecha `D` escrita en el instante `W` está obsoleta si existe algún lote
 * con `tradedAt <= D` cuyo último cambio (`max(createdAt, updatedAt)`) es POSTERIOR a `W`. Un
 * lote nuevo con fecha de hoy no invalida nada (su `tradedAt` es posterior a toda captura
 * anterior), y las capturas anteriores al lote cambiado tampoco (su `D` es menor que `tradedAt`).
 *
 * Los lotes BORRADOS no dejan marca de tiempo: el llamante pasa `invalidateFrom` (la fecha de
 * operación del lote borrado, o la anterior de uno movido) y se tratan como obsoletas todas las
 * capturas con fecha `>= invalidateFrom`.
 */

/** Lote reducido a lo que importa para la regla. */
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

const byDate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Fechas (YYYY-MM-DD) de las capturas obsoletas. Una pasada ordenada: se recorren los lotes por
 * fecha de operación acumulando el cambio más reciente, así que cuesta O(n log n) aunque haya
 * miles de capturas y de lotes.
 */
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
