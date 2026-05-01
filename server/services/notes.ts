import type Database from 'better-sqlite3';

const DEFAULT_NOTES_FIELD_ID = 3;

export type NormalizedNote = Record<string, unknown> & {
  field_id?: unknown;
  value: string;
};

type NoteRow = {
  id: number;
  notes: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeNoteEntry(entry: unknown): NormalizedNote | null {
  if (entry == null) {
    return null;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed ? { field_id: null, value: trimmed } : null;
  }

  if (!isRecord(entry)) {
    const trimmed = String(entry).trim();
    return trimmed ? { field_id: null, value: trimmed } : null;
  }

  const rawValue = entry.value;
  if (rawValue == null) {
    return null;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return null;
  }

  return {
    ...entry,
    value: trimmed
  };
}

export function normalizeNotes(notes: unknown): NormalizedNote[] {
  if (!notes) {
    return [];
  }

  if (Array.isArray(notes)) {
    return notes.map(normalizeNoteEntry).filter((note): note is NormalizedNote => Boolean(note));
  }

  const normalized = normalizeNoteEntry(notes);
  return normalized ? [normalized] : [];
}

export function parseStoredNotes(value: unknown): unknown {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value as string);
  } catch {
    return value;
  }
}

export function hasMeaningfulNotes(notes: unknown): boolean {
  return normalizeNotes(notes).length > 0;
}

export function notesToText(notes: unknown): string {
  return normalizeNotes(notes).map((item) => item?.value).filter(Boolean).join(' | ');
}

export function resolveNoteFieldId(notes: unknown, fallback: unknown = DEFAULT_NOTES_FIELD_ID): unknown {
  const normalized = normalizeNotes(notes);

  if (normalized.some((note) => note.field_id === DEFAULT_NOTES_FIELD_ID)) {
    return DEFAULT_NOTES_FIELD_ID;
  }

  return normalized[normalized.length - 1]?.field_id ?? fallback;
}

export function replaceNoteText(
  notes: unknown,
  nextText: unknown,
  fieldId: unknown = resolveNoteFieldId(notes),
): NormalizedNote[] {
  const normalized = normalizeNotes(notes);
  const trimmed = String(nextText || '').trim();
  const nextNotes = normalized.filter((note) => note.field_id !== fieldId);

  if (!trimmed) {
    return nextNotes;
  }

  return normalizeNotes([
    ...nextNotes,
    { field_id: fieldId, value: trimmed }
  ]);
}

export function countMeaningfulNoteRows(rows: Array<{ notes?: unknown } | null | undefined>): number {
  return rows.filter((row) => hasMeaningfulNotes(parseStoredNotes(row?.notes))).length;
}

export function cleanupStoredNotes(db: Database.Database): number {
  const rows = db.prepare<[], NoteRow>(`
    SELECT id, notes
    FROM releases
    WHERE notes IS NOT NULL AND notes != ''
  `).all();

  if (!rows.length) {
    return 0;
  }

  const updateNote = db.prepare('UPDATE releases SET notes = ? WHERE id = ?');
  const cleanupTx = db.transaction((items: NoteRow[]): number => {
    let updated = 0;

    for (const row of items) {
      const normalized = JSON.stringify(normalizeNotes(parseStoredNotes(row.notes)));
      if (normalized !== row.notes) {
        updateNote.run(normalized, row.id);
        updated += 1;
      }
    }

    return updated;
  });

  return cleanupTx(rows);
}
