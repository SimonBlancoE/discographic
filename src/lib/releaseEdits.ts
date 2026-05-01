import type { UpdateReleasePatch } from './types';
import type { CollectionRelease, ReleaseDetail } from '../../shared/contracts/release.js';

function normalizeNoteText(value: string | null | undefined): string {
  return String(value || '').trim();
}

type EditableRelease = Pick<CollectionRelease, 'rating' | 'notes' | 'notes_text'>;

export function applyOptimisticReleasePatch<T extends EditableRelease>(release: T, patch: UpdateReleasePatch): {
  nextPatch: UpdateReleasePatch;
  nextRelease: T;
} {
  const nextPatch = patch.notes === undefined
    ? patch
    : { ...patch, notes: normalizeNoteText(patch.notes) };
  const nextRelease = { ...release };

  if (nextPatch.rating !== undefined) {
    nextRelease.rating = nextPatch.rating;
  }

  if (nextPatch.notes !== undefined) {
    nextRelease.notes_text = nextPatch.notes;
    nextRelease.notes = nextPatch.notes ? [{ field_id: null, value: nextPatch.notes }] : [];
  }

  return {
    nextPatch,
    nextRelease
  };
}
