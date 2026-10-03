import { describe, expect, it } from 'vitest';

import { SnapshotRebuildQueue, type RebuildBatch } from './snapshot-rebuild.queue.js';

/** Promesa que el test resuelve a mano, para dejar una reconstrucción "en curso". */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('SnapshotRebuildQueue', () => {
  it('con una reconstrucción en curso solo anota, y al terminar repite UNA vez con todo lo anotado', async () => {
    const queue = new SnapshotRebuildQueue();
    const batches: RebuildBatch[] = [];
    const first = deferred();
    const rebuild = async (batch: RebuildBatch): Promise<void> => {
      batches.push(batch);
      if (batches.length === 1) await first.promise;
    };
    const fail = (error: unknown): void => {
      throw error;
    };

    const running = queue.enqueue('u1', { positionId: 'p1' }, rebuild, fail);
    await queue.enqueue('u1', { positionId: 'p2', invalidateFrom: '2026-05-10' }, rebuild, fail);
    await queue.enqueue('u1', { positionId: 'p3', invalidateFrom: '2026-03-01' }, rebuild, fail);
    await queue.enqueue('u1', { positionId: 'p2' }, rebuild, fail);
    first.resolve();
    await running;

    expect(batches).toEqual([
      { positionIds: ['p1'], invalidateFrom: null },
      // La fecha más antigua de las anotadas, y cada posición una sola vez.
      { positionIds: ['p2', 'p3'], invalidateFrom: '2026-03-01' },
    ]);
  });

  it('los usuarios no se esperan entre sí', async () => {
    const queue = new SnapshotRebuildQueue();
    const seen: string[] = [];
    const blocked = deferred();

    const a = queue.enqueue(
      'a',
      { positionId: 'pa' },
      () => blocked.promise,
      () => {},
    );
    await queue.enqueue(
      'b',
      { positionId: 'pb' },
      () => {
        seen.push('b');
        return Promise.resolve();
      },
      () => {},
    );
    expect(seen).toEqual(['b']);
    blocked.resolve();
    await a;
  });

  it('un fallo se entrega a onError y no impide la tanda siguiente ni una nueva reconstrucción', async () => {
    const queue = new SnapshotRebuildQueue();
    const errors: unknown[] = [];
    const first = deferred();
    let calls = 0;
    const rebuild = async (): Promise<void> => {
      calls += 1;
      if (calls === 1) {
        await first.promise;
        throw new Error('boom');
      }
    };

    const running = queue.enqueue('u1', { positionId: 'p1' }, rebuild, (error) => errors.push(error));
    await queue.enqueue('u1', { positionId: 'p2' }, rebuild, (error) => errors.push(error));
    first.resolve();
    await running;
    await queue.enqueue('u1', { positionId: 'p3' }, rebuild, (error) => errors.push(error));

    expect(errors).toHaveLength(1);
    expect(calls).toBe(3);
  });
});
