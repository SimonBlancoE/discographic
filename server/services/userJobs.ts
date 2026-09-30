// Account resets invalidate every captured scope before any collection data is removed.
// Individual jobs also cancel their scope on stop/replacement; old continuations and finally
// handlers must check that scope rather than another run's per-user running flag.
type UserJobCanceller = (userId: number) => void;
const cancellers = new Set<UserJobCanceller>();
const generations = new Map<number, object>();

export type UserJobScope = {
  readonly stopped: boolean;
  cancel: () => void;
  assertCurrent: () => void;
};

export class UserJobCancelledError extends Error {
  constructor() {
    super('Account operation was cancelled');
  }
}

export function createUserJobScope(userId: number): UserJobScope {
  let generation = generations.get(userId);
  if (!generation) {
    generation = {};
    generations.set(userId, generation);
  }
  let cancelled = false;
  const scope: UserJobScope = {
    get stopped() { return cancelled || generations.get(userId) !== generation; },
    cancel() { cancelled = true; },
    assertCurrent() { if (scope.stopped) throw new UserJobCancelledError(); },
  };
  return scope;
}

export function registerUserJobCanceller(canceller: UserJobCanceller): void {
  cancellers.add(canceller);
}

export function cancelUserJobs(userId: number): void {
  // Delete instead of incrementing: object identity also handles deletion and later ID reuse.
  generations.delete(userId);
  for (const cancel of cancellers) cancel(userId);
}
