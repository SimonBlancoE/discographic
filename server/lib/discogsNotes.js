// Discogs custom-fields helpers. The "Notes" field is conventionally field_id 3
// in a Discogs collection. If the release already has structured notes, we
// reuse the existing field_id for the last entry so we update it in place
// rather than appending a duplicate.

const NOTES_FIELD_ID = 3;

export function resolveNotesFieldId(notes) {
  if (notes.find((entry) => entry.field_id === NOTES_FIELD_ID)) {
    return NOTES_FIELD_ID;
  }
  if (notes.length > 0) {
    return notes[notes.length - 1].field_id || NOTES_FIELD_ID;
  }
  return NOTES_FIELD_ID;
}

export function upsertNote(notes, fieldId, value) {
  if (notes.some((entry) => entry.field_id === fieldId)) {
    return notes.map((entry) => entry.field_id === fieldId ? { ...entry, value } : entry);
  }
  return [...notes, { field_id: fieldId, value }];
}
