import * as XLSX from 'xlsx';
import { RADAR_PRIORITY, type RadarPriority } from '../../shared/contracts/radar.js';

type Translate = (key: string) => string;

type RawRow = Record<string, unknown>;

type RadarWantlistColumnKey =
  | 'release_id'
  | 'artist'
  | 'title'
  | 'year'
  | 'notes'
  | 'date_added'
  | 'target_price'
  | 'minimum_condition'
  | 'priority';

type RadarWantlistColumn = {
  header: string;
  key: RadarWantlistColumnKey;
  required: boolean;
};

type RadarWantlistError = {
  row: number;
  column: string;
  value: string;
  reason: string;
};

type RadarWantlistPreviewRow = {
  row: number;
  release_id: number;
  artist: string | null;
  title: string | null;
  year: number | null;
  notes: string | null;
  date_added: string | null;
  target_price: number | null;
  minimum_condition: string | null;
  priority: RadarPriority | null;
};

type RadarWantlistPreview = {
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
  mappedColumns: RadarWantlistColumn[];
  ignoredColumns: string[];
  rows: RadarWantlistPreviewRow[];
  errors: RadarWantlistError[];
};

const HEADER_ALIASES = new Map<string, RadarWantlistColumnKey>([
  ['releaseid', 'release_id'],
  ['release_id', 'release_id'],
  ['iddiscogs', 'release_id'],
  ['discogsrelease', 'release_id'],
  ['releasediscogs', 'release_id'],
  ['artist', 'artist'],
  ['artista', 'artist'],
  ['title', 'title'],
  ['titulo', 'title'],
  ['year', 'year'],
  ['ano', 'year'],
  ['notes', 'notes'],
  ['note', 'notes'],
  ['notas', 'notes'],
  ['nota', 'notes'],
  ['dateadded', 'date_added'],
  ['date_added', 'date_added'],
  ['fechadealta', 'date_added'],
  ['targetprice', 'target_price'],
  ['target_price', 'target_price'],
  ['precioobjetivo', 'target_price'],
  ['preciomaximo', 'target_price'],
  ['minimumcondition', 'minimum_condition'],
  ['minimum_condition', 'minimum_condition'],
  ['condicionminima', 'minimum_condition'],
  ['priority', 'priority'],
  ['prioridad', 'priority'],
]);

const PRIORITY_ALIASES = new Map<string, RadarPriority>([
  ['low', RADAR_PRIORITY.LOW],
  ['baja', RADAR_PRIORITY.LOW],
  ['bajo', RADAR_PRIORITY.LOW],
  ['normal', RADAR_PRIORITY.NORMAL],
  ['media', RADAR_PRIORITY.NORMAL],
  ['medio', RADAR_PRIORITY.NORMAL],
  ['high', RADAR_PRIORITY.HIGH],
  ['alta', RADAR_PRIORITY.HIGH],
  ['alto', RADAR_PRIORITY.HIGH],
]);

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeRadarWantlistHeader(header: unknown): string {
  return String(header ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function parseRadarWantlistNumber(value: string): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes('.') ? value : value.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRadarWantlistInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  return Number(value);
}

function parseRadarWantlistPriority(value: string): RadarPriority | null {
  if (!value) {
    return null;
  }

  return PRIORITY_ALIASES.get(normalizeRadarWantlistHeader(value)) ?? null;
}

function toIsoDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseRadarWantlistDateValue(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDateString(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    const year = String(parsed.y).padStart(4, '0');
    const month = String(parsed.m).padStart(2, '0');
    const day = String(parsed.d).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const textValue = toText(value);
  if (!textValue || Number.isNaN(Date.parse(textValue))) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(textValue)) {
    return textValue.slice(0, 10);
  }

  return toIsoDateString(new Date(textValue));
}

function parseRadarWantlistRows(sheet: XLSX.WorkSheet): RawRow[] {
  return XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: '',
    raw: true,
  });
}

export function parseRadarWantlistWorkbook(buffer: Buffer, filename: string, t: Translate): RawRow[] {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error(t('backend.radarImport.fileType'));
  }

  const workbook = extension === 'csv'
    ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
    : XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(t('backend.radarImport.noSheets'));
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = parseRadarWantlistRows(firstSheet);
  if (rows.length === 0) {
    throw new Error(t('backend.radarImport.noRows'));
  }

  return rows;
}

function resolveRadarWantlistColumns(rows: RawRow[], t: Translate): { mappedColumns: RadarWantlistColumn[]; ignoredColumns: string[] } {
  const headers = Object.keys(rows[0] ?? {});
  const mappedColumns: RadarWantlistColumn[] = [];
  const ignoredColumns: string[] = [];
  let hasReleaseId = false;

  for (const header of headers) {
    const key = HEADER_ALIASES.get(normalizeRadarWantlistHeader(header));
    if (!key) {
      ignoredColumns.push(header);
      continue;
    }

    const isRequired = key === 'release_id';
    if (isRequired) {
      hasReleaseId = true;
    }

    mappedColumns.push({
      header,
      key,
      required: isRequired,
    });
  }

  if (!hasReleaseId) {
    throw new Error(t('backend.radarImport.releaseIdColumnRequired'));
  }

  return { mappedColumns, ignoredColumns };
}

function buildEmptyPreview(): RadarWantlistPreview {
  return {
    summary: {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
    },
    mappedColumns: [],
    ignoredColumns: [],
    rows: [],
    errors: [],
  };
}

export function buildRadarWantlistPreview(rows: RawRow[], t: Translate): RadarWantlistPreview {
  const preview = buildEmptyPreview();
  const { mappedColumns, ignoredColumns } = resolveRadarWantlistColumns(rows, t);

  preview.summary.totalRows = rows.length;
  preview.mappedColumns = mappedColumns;
  preview.ignoredColumns = ignoredColumns;

  for (const [index, rawRow] of rows.entries()) {
    const rowNumber = index + 2;
    const rowErrors: RadarWantlistError[] = [];
    const parsedRow: RadarWantlistPreviewRow = {
      row: rowNumber,
      release_id: 0,
      artist: null,
      title: null,
      year: null,
      notes: null,
      date_added: null,
      target_price: null,
      minimum_condition: null,
      priority: null,
    };

    for (const column of mappedColumns) {
      const sourceValue = isObjectRecord(rawRow) ? rawRow[column.header] : '';
      const textValue = toText(sourceValue);

      switch (column.key) {
        case 'release_id': {
          const releaseId = parseRadarWantlistInteger(textValue);
          if (!releaseId || releaseId <= 0) {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              value: textValue,
              reason: t('backend.radarImport.invalidReleaseId'),
            });
            break;
          }

          parsedRow.release_id = releaseId;
          break;
        }

        case 'artist':
          parsedRow.artist = textValue || null;
          break;

        case 'title':
          parsedRow.title = textValue || null;
          break;

        case 'year': {
          if (!textValue) {
            break;
          }

          const year = parseRadarWantlistInteger(textValue);
          if (year == null) {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              value: textValue,
              reason: t('backend.radarImport.invalidYear'),
            });
            break;
          }

          parsedRow.year = year;
          break;
        }

        case 'notes':
          parsedRow.notes = textValue || null;
          break;

        case 'date_added': {
          if (sourceValue == null || sourceValue === '') {
            break;
          }

          const parsedDate = parseRadarWantlistDateValue(sourceValue);
          if (!parsedDate) {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              value: textValue,
              reason: t('backend.radarImport.invalidDateAdded'),
            });
            break;
          }

          parsedRow.date_added = parsedDate;
          break;
        }

        case 'target_price': {
          if (!textValue) {
            break;
          }

          const targetPrice = parseRadarWantlistNumber(textValue);
          if (targetPrice == null) {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              value: textValue,
              reason: t('backend.radarImport.invalidTargetPrice'),
            });
            break;
          }

          parsedRow.target_price = targetPrice;
          break;
        }

        case 'minimum_condition':
          parsedRow.minimum_condition = textValue || null;
          break;

        case 'priority': {
          if (!textValue) {
            break;
          }

          const priority = parseRadarWantlistPriority(textValue);
          if (!priority) {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              value: textValue,
              reason: t('backend.radarImport.invalidPriority'),
            });
            break;
          }

          parsedRow.priority = priority;
          break;
        }
      }
    }

    if (rowErrors.length > 0) {
      preview.errors.push(...rowErrors);
      continue;
    }

    preview.rows.push(parsedRow);
  }

  preview.summary.validRows = preview.rows.length;
  preview.summary.invalidRows = preview.summary.totalRows - preview.summary.validRows;

  return preview;
}
