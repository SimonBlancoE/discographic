// Account resets invalidate every captured scope before any collection data is removed.
// Individual jobs also cancel their scope on stop/replacement; old continuations and finally
// handlers must check that scope rather than another run's per-user running flag.
type UserJobCanceller = (userId: number) => void;
const cancellers = new Set<UserJobCanceller>();
const generations = new Map<number, AbortController>();

export type UserJobScope = {
  readonly stopped: boolean;
  readonly signal: AbortSignal;
  cancel: () => void;
  assertCurrent: () => void;
};

export class UserJobCancelledError extends Error {
  constructor() {
    super('Account operation was cancelled');
    this.name = 'AbortError';
  }
}

export function createUserJobScope(userId: number): UserJobScope {
  let generation = generations.get(userId);
  if (!generation) {
    generation = new AbortController();
    generations.set(userId, generation);
  }
  const controller = new AbortController();
  // Native composition uses weak dependencies: the account generation must not retain
  // every transient route scope until reset. Request-owned timers/listeners are disposed.
  const signal = AbortSignal.any([generation.signal, controller.signal]);
  const scope: UserJobScope = {
    signal,
    get stopped() { return signal.aborted; },
    cancel() { controller.abort(new UserJobCancelledError()); },
    assertCurrent() { if (scope.stopped) throw new UserJobCancelledError(); },
  };
  return scope;
}

export function registerUserJobCanceller(canceller: UserJobCanceller): void {
  cancellers.add(canceller);
}

export function cancelUserJobs(userId: number): void {
  // Delete instead of incrementing: object identity also handles deletion and later ID reuse.
  const generation = generations.get(userId);
  generations.delete(userId);
  generation?.abort(new UserJobCancelledError());
  for (const cancel of cancellers) cancel(userId);
}
