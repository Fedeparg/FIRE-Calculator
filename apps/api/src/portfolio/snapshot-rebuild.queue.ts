/** A user's pending work: positions whose lots changed and the earliest date to invalidate. */
type Pending = { positions: Set<string>; invalidateFrom: string | null };

/** One rebuild batch: the recorded positions and the date to invalidate from (`null` = no deletions). */
export type RebuildBatch = { positionIds: string[]; invalidateFrom: string | null };

const earliest = (a: string | null, b: string | null | undefined): string | null =>
  b !== null && b !== undefined && (a === null || b < a) ? b : a;

/**
 * Per-user coalescing of history rebuilds. A burst of lot edits would trigger one rebuild per
 * event, each holding a connection while it waits for the user's lock, and more than ~10 would
 * exhaust the pool. With the queue, if a rebuild is already running only the position (and the
 * earliest date to invalidate) is recorded; when it finishes it runs ONCE more covering everything
 * recorded, until nothing is left. In memory and per process, like the jobs' lock.
 */
export class SnapshotRebuildQueue {
  private readonly running = new Map<string, Pending>();

  /**
   * Records the change and, if no other rebuild is running for the user, runs `rebuild` in
   * batches until nothing is pending. A `rebuild` that throws does not stop the following batches:
   * the error is passed to `onError`. Resolves when the rebuild it started finishes, or
   * immediately if it only recorded the change.
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
