// Discogs collection custom fields (condition grading, notes) and collection folders.
// Discogs creates three default fields for every account: 1 = Media Condition,
// 2 = Sleeve Condition, 3 = Notes. Users can rename or add fields, so the live
// definitions from `/users/{u}/collection/fields` win when they are available.

export const DEFAULT_MEDIA_CONDITIONS = Object.freeze([
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
]);

export const DEFAULT_SLEEVE_CONDITIONS = Object.freeze([
  'Generic',
  'No Cover',
  ...DEFAULT_MEDIA_CONDITIONS,
]);

export type CollectionFieldMap = {
  notesFieldId: number;
  mediaFieldId: number | null;
  sleeveFieldId: number | null;
  mediaOptions: string[];
  sleeveOptions: string[];
};

export type CollectionFolder = {
  id: number;
  name: string;
  count: number;
};

export const DEFAULT_COLLECTION_FIELD_MAP: CollectionFieldMap = Object.freeze({
  notesFieldId: 3,
  mediaFieldId: 1,
  sleeveFieldId: 2,
  mediaOptions: [...DEFAULT_MEDIA_CONDITIONS],
  sleeveOptions: [...DEFAULT_SLEEVE_CONDITIONS],
}) as CollectionFieldMap;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

type DiscogsField = { id: number; name: string; type: string; options: string[] };

function normalizeDiscogsFields(value: unknown): DiscogsField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const id = asPositiveInt(record?.id);
    if (!record || id == null) {
      return [];
    }

    return [{
      id,
      name: typeof record.name === 'string' ? record.name.trim().toLowerCase() : '',
      type: typeof record.type === 'string' ? record.type : '',
      options: asStringList(record.options),
    }];
  });
}

function pickDropdown(fields: DiscogsField[], keyword: string, fallbackId: number): DiscogsField | null {
  const dropdowns = fields.filter((field) => field.type === 'dropdown');
  return dropdowns.find((field) => field.name.includes(keyword))
    ?? dropdowns.find((field) => field.id === fallbackId)
    ?? null;
}

/**
 * Accepts either the raw Discogs `{ fields: [...] }` payload or a previously stored map.
 */
export function normalizeCollectionFieldMap(payload: unknown): CollectionFieldMap {
  const source = asRecord(payload);
  if (!source) {
    return { ...DEFAULT_COLLECTION_FIELD_MAP };
  }

  if (Array.isArray(source.fields)) {
    const fields = normalizeDiscogsFields(source.fields);
    if (!fields.length) {
      return { ...DEFAULT_COLLECTION_FIELD_MAP };
    }

    const media = pickDropdown(fields, 'media', 1);
    const sleeve = pickDropdown(fields, 'sleeve', 2);
    const textareas = fields.filter((field) => field.type === 'textarea');
    const notes = textareas.find((field) => field.name.includes('note')) ?? textareas[0] ?? null;

    return {
      notesFieldId: notes?.id ?? DEFAULT_COLLECTION_FIELD_MAP.notesFieldId,
      mediaFieldId: media?.id ?? null,
      sleeveFieldId: sleeve?.id ?? null,
      mediaOptions: media?.options.length ? media.options : [...DEFAULT_MEDIA_CONDITIONS],
      sleeveOptions: sleeve?.options.length ? sleeve.options : [...DEFAULT_SLEEVE_CONDITIONS],
    };
  }

  const mediaOptions = asStringList(source.mediaOptions);
  const sleeveOptions = asStringList(source.sleeveOptions);
  return {
    notesFieldId: asPositiveInt(source.notesFieldId) ?? DEFAULT_COLLECTION_FIELD_MAP.notesFieldId,
    mediaFieldId: source.mediaFieldId === null ? null : asPositiveInt(source.mediaFieldId) ?? DEFAULT_COLLECTION_FIELD_MAP.mediaFieldId,
    sleeveFieldId: source.sleeveFieldId === null ? null : asPositiveInt(source.sleeveFieldId) ?? DEFAULT_COLLECTION_FIELD_MAP.sleeveFieldId,
    mediaOptions: mediaOptions.length ? mediaOptions : [...DEFAULT_MEDIA_CONDITIONS],
    sleeveOptions: sleeveOptions.length ? sleeveOptions : [...DEFAULT_SLEEVE_CONDITIONS],
  };
}

/** Accepts the raw Discogs `{ folders: [...] }` payload or a stored folder list. Folder 0 ("All") is virtual and dropped. */
export function normalizeCollectionFolders(payload: unknown): CollectionFolder[] {
  const source = asRecord(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(source?.folders) ? source?.folders as unknown[] : [];

  return list.flatMap((entry) => {
    const record = asRecord(entry);
    const id = Number(record?.id);
    if (!record || !Number.isInteger(id) || id <= 0) {
      return [];
    }

    const count = Number(record.count);
    return [{
      id,
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `#${id}`,
      count: Number.isFinite(count) && count >= 0 ? count : 0,
    }];
  });
}

/** "Very Good Plus (VG+)" -> "VG+", "Near Mint (NM or M-)" -> "NM"; anything else is returned as-is. */
export function conditionShortLabel(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const match = value.match(/\(([^)]+)\)\s*$/);
  if (!match) {
    return value;
  }

  return match[1].split(/\s+or\s+/i)[0].trim();
}
