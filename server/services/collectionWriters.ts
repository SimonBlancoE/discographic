import type { UserJobScope } from './userJobs.js';

// All outbound writes for a collection copy share a lane. A cancelled writer keeps its
// lane until its request settles; releasing it early would permit remote write reordering.
const lanes = new Map<string, Promise<void>>();
export async function withCollectionWriter<T>(
  userId: number, instanceId: number, scope: UserJobScope, work: () => Promise<T>,
): Promise<T> {
  const key = `${userId}:${instanceId}`;
  const previous = lanes.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => current);
  lanes.set(key, tail);
  try {
    await previous;
    scope.assertCurrent();
    return await work();
  } finally {
    release();
    if (lanes.get(key) === tail) lanes.delete(key);
  }
}
