function normalizeNoteEntry(entry) {
  if (entry == null) {
    return null;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed ? { field_id: null, value: trimmed } : null;
  }

  if (typeof entry !== 'object') {
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

export function normalizeNotes(notes) {
  if (!notes) {
    return [];
  }

  if (Array.isArray(notes)) {
    return notes.map(normalizeNoteEntry).filter(Boolean);
  }

  const normalized = normalizeNoteEntry(notes);
  return normalized ? [normalized] : [];
}

export function parseStoredNotes(value) {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function hasMeaningfulNotes(notes) {
  return normalizeNotes(notes).length > 0;
}

export function countMeaningfulNoteRows(rows) {
  return rows.filter((row) => hasMeaningfulNotes(parseStoredNotes(row?.notes))).length;
}

export function cleanupStoredNotes(db) {
  const rows = db.prepare(`
    SELECT id, notes
    FROM releases
    WHERE notes IS NOT NULL AND notes != ''
  `).all();

  if (!rows.length) {
    return 0;
  }

  const updateNote = db.prepare('UPDATE releases SET notes = ? WHERE id = ?');
  const cleanupTx = db.transaction((items) => {
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
