/** Trabajo pendiente de un usuario: posiciones cuyos lotes cambiaron y la fecha más antigua a invalidar. */
type Pending = { positions: Set<string>; invalidateFrom: string | null };

/** Una tanda de reconstrucción: las posiciones anotadas y desde qué fecha invalidar (`null` = sin borrados). */
export type RebuildBatch = { positionIds: string[]; invalidateFrom: string | null };

const earliest = (a: string | null, b: string | null | undefined): string | null =>
  b !== null && b !== undefined && (a === null || b < a) ? b : a;

/**
 * Coalescencia de las reconstrucciones del histórico por usuario. Una ráfaga de ediciones de
 * lotes dispararía una reconstrucción por evento, cada una con una conexión esperando el cerrojo
 * del usuario, y más de ~10 agotarían el pool. Con la cola, si ya hay una en curso solo se anota
 * la posición (y la fecha más antigua a invalidar); al terminar se repite UNA vez cubriendo todo
 * lo anotado, hasta que no quede nada. En memoria y por proceso, como el cerrojo de los jobs.
 */
export class SnapshotRebuildQueue {
  private readonly running = new Map<string, Pending>();

  /**
   * Anota el cambio y, si no hay otra reconstrucción en curso para el usuario, ejecuta `rebuild`
   * por tandas hasta vaciar lo pendiente. Un `rebuild` que lanza no detiene las tandas siguientes:
   * el error se entrega a `onError`. Resuelve cuando la reconstrucción que inició termina, o al
   * instante si solo ha anotado.
   */
  async enqueue(
    userId: string,
    change: { positionId: string; invalidateFrom?: string | null },
    rebuild: (batch: RebuildBatch) => Promise<void>,
    onError: (error: unknown) => void,
  ): Promise<void> {
    const current = this.running.get(userId);
    if (current) {
      current.positions.add(change.positionId);
      current.invalidateFrom = earliest(current.invalidateFrom, change.invalidateFrom);
      return;
    }
    const pending: Pending = {
      positions: new Set([change.positionId]),
      invalidateFrom: earliest(null, change.invalidateFrom),
    };
    this.running.set(userId, pending);
    try {
      while (pending.positions.size > 0) {
        const batch: RebuildBatch = { positionIds: [...pending.positions], invalidateFrom: pending.invalidateFrom };
        pending.positions.clear();
        pending.invalidateFrom = null;
        try {
          await rebuild(batch);
        } catch (error) {
          onError(error);
        }
      }
    } finally {
      this.running.delete(userId);
    }
  }
}
