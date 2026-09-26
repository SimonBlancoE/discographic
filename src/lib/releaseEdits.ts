import type { UpdateReleasePatch } from './types';
import type { CollectionRelease, ReleaseDetail } from '../../shared/contracts/release.js';

function normalizeNoteText(value: string | null | undefined): string {
  return String(value || '').trim();
}

type EditableRelease = Pick<CollectionRelease, 'rating' | 'notes' | 'notes_text' | 'media_condition' | 'sleeve_condition' | 'folder_id'>;

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
    // The raw `notes` array also holds condition fields; the server response replaces it.
    nextRelease.notes_text = nextPatch.notes;
  }

  if (nextPatch.media_condition !== undefined) {
    nextRelease.media_condition = nextPatch.media_condition || null;
  }

  if (nextPatch.sleeve_condition !== undefined) {
    nextRelease.sleeve_condition = nextPatch.sleeve_condition || null;
  }

  if (nextPatch.folder_id !== undefined) {
    nextRelease.folder_id = nextPatch.folder_id;
  }

  return {
    nextPatch,
    nextRelease
  };
}
