export function normalizeNoteText(value) {
  return String(value || '').trim();
}

export function applyOptimisticReleasePatch(release, patch) {
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
