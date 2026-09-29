// Background jobs (Discogs sync run, marketplace enrichment) keep per-user state in their own
// modules. When a user's local collection is reset or the user is deleted, those jobs must stop,
// otherwise they keep writing the previous account's releases into the cleared collection.
type UserJobCanceller = (userId: number) => void;

const cancellers = new Set<UserJobCanceller>();

export function registerUserJobCanceller(canceller: UserJobCanceller): void {
  cancellers.add(canceller);
}

export function cancelUserJobs(userId: number): void {
  for (const cancel of cancellers) {
    cancel(userId);
  }
}
