import * as XLSX from 'xlsx';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_SOURCE_STATUS,
  RADAR_PRIORITY,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarWantlistApplyResult,
  type RadarWantlistColumnKey,
  type RadarWantlistPreviewColumn,
  type RadarWantlistPreviewError,
  type RadarWantlistPreviewResponse,
  type RadarWantlistPreviewRow,
  type RadarWantlistTemplateFormat,
} from '../../shared/contracts/radar.js';
import type Database from 'better-sqlite3';

type Translate = (key: string) => string;

type RawRow = Record<string, unknown>;

type ResolvedRadarWantlistColumns = {
  mappedColumns: RadarWantlistPreviewColumn[];
  ignoredColumns: string[];
};

const DATA_ROW_NUMBER_OFFSET = 2;

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

const MINIMUM_CONDITION_ALIASES = new Map<string, RadarMinimumCondition>([
  ['M', RADAR_MINIMUM_CONDITION.MINT],
  ['MINT', RADAR_MINIMUM_CONDITION.MINT],
  ['NM', RADAR_MINIMUM_CONDITION.NEAR_MINT],
  ['NEAR MINT', RADAR_MINIMUM_CONDITION.NEAR_MINT],
  ['VG+', RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS],
  ['VERY GOOD PLUS', RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS],
  ['VG', RADAR_MINIMUM_CONDITION.VERY_GOOD],
  ['VERY GOOD', RADAR_MINIMUM_CONDITION.VERY_GOOD],
  ['G+', RADAR_MINIMUM_CONDITION.GOOD_PLUS],
  ['GOOD PLUS', RADAR_MINIMUM_CONDITION.GOOD_PLUS],
  ['G', RADAR_MINIMUM_CONDITION.GOOD],
  ['GOOD', RADAR_MINIMUM_CONDITION.GOOD],
  ['F', RADAR_MINIMUM_CONDITION.FAIR],
  ['FAIR', RADAR_MINIMUM_CONDITION.FAIR],
  ['P', RADAR_MINIMUM_CONDITION.POOR],
  ['POOR', RADAR_MINIMUM_CONDITION.POOR],
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

function parseRadarWantlistMinimumCondition(value: string): RadarMinimumCondition | null {
  if (!value) {
    return null;
  }

  return MINIMUM_CONDITION_ALIASES.get(value.trim().toUpperCase()) ?? null;
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

function parseRadarWantlistFileExtension(filename: string): RadarWantlistTemplateFormat | null {
  const extension = filename.toLowerCase().split('.').pop();
  return extension === 'csv' || extension === 'xlsx' ? extension : null;
}

function readRadarWantlistWorkbook(buffer: Buffer, extension: RadarWantlistTemplateFormat): XLSX.WorkBook {
  if (extension === 'csv') {
    return XLSX.read(buffer.toString('utf8'), { type: 'string' });
  }

  return XLSX.read(buffer, { type: 'buffer' });
}

export function parseRadarWantlistWorkbook(buffer: Buffer, filename: string, t: Translate): RawRow[] {
  const extension = parseRadarWantlistFileExtension(filename);
  if (!extension) {
    throw new Error(t('backend.radarImport.fileType'));
  }

  const workbook = readRadarWantlistWorkbook(buffer, extension);
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

function resolveRadarWantlistColumns(rows: RawRow[], t: Translate): ResolvedRadarWantlistColumns {
  const headers = Object.keys(rows[0] ?? {});
  const mappedColumns: RadarWantlistPreviewColumn[] = [];
  const ignoredColumns: string[] = [];
  let hasRequiredReleaseIdColumn = false;

  for (const header of headers) {
    const key = HEADER_ALIASES.get(normalizeRadarWantlistHeader(header));
    if (!key) {
      ignoredColumns.push(header);
      continue;
    }

    const isRequired = key === 'release_id';
    if (isRequired) {
      hasRequiredReleaseIdColumn = true;
    }

    mappedColumns.push({
      header,
      key,
      required: isRequired,
    });
  }

  if (!hasRequiredReleaseIdColumn) {
    throw new Error(t('backend.radarImport.releaseIdColumnRequired'));
  }

  return { mappedColumns, ignoredColumns };
}

function createPreviewRow(rowNumber: number): RadarWantlistPreviewRow {
  return {
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
}

function createPreviewError(
  rowNumber: number,
  column: RadarWantlistPreviewColumn,
  value: string,
  reason: string,
): RadarWantlistPreviewError {
  return {
    row: rowNumber,
    column: column.header,
    value,
    reason,
  };
}

export function buildRadarWantlistPreview(rows: RawRow[], t: Translate): RadarWantlistPreviewResponse {
  const { mappedColumns, ignoredColumns } = resolveRadarWantlistColumns(rows, t);
  const previewRows: RadarWantlistPreviewRow[] = [];
  const errors: RadarWantlistPreviewError[] = [];
  const seenReleaseIds = new Set<number>();

  for (const [index, rawRow] of rows.entries()) {
    const rowNumber = index + DATA_ROW_NUMBER_OFFSET;
    const rowErrors: RadarWantlistPreviewError[] = [];
    const parsedRow = createPreviewRow(rowNumber);

    for (const column of mappedColumns) {
      const sourceValue = isObjectRecord(rawRow) ? rawRow[column.header] : '';
      const textValue = toText(sourceValue);

      switch (column.key) {
        case 'release_id': {
          const releaseId = parseRadarWantlistInteger(textValue);
          if (!releaseId || releaseId <= 0) {
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidReleaseId')),
            );
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
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidYear')),
            );
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
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidDateAdded')),
            );
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
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidTargetPrice')),
            );
            break;
          }

          parsedRow.target_price = targetPrice;
          break;
        }

        case 'minimum_condition': {
          if (!textValue) {
            break;
          }

          const minimumCondition = parseRadarWantlistMinimumCondition(textValue);
          if (!minimumCondition) {
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidMinimumCondition')),
            );
            break;
          }

          parsedRow.minimum_condition = minimumCondition;
          break;
        }

        case 'priority': {
          if (!textValue) {
            break;
          }

          const priority = parseRadarWantlistPriority(textValue);
          if (!priority) {
            rowErrors.push(
              createPreviewError(rowNumber, column, textValue, t('backend.radarImport.invalidPriority')),
            );
            break;
          }

          parsedRow.priority = priority;
          break;
        }
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    if (seenReleaseIds.has(parsedRow.release_id)) {
      const releaseIdColumn = mappedColumns.find((column) => column.key === 'release_id');
      if (releaseIdColumn) {
        errors.push(
          createPreviewError(
            rowNumber,
            releaseIdColumn,
            String(parsedRow.release_id),
            t('backend.radarImport.duplicateReleaseId'),
          ),
        );
      }
      continue;
    }

    seenReleaseIds.add(parsedRow.release_id);
    previewRows.push(parsedRow);
  }

  return {
    previewId: null,
    summary: {
      totalRows: rows.length,
      validRows: previewRows.length,
      invalidRows: rows.length - previewRows.length,
    },
    mappedColumns,
    ignoredColumns,
    rows: previewRows,
    errors,
  };
}

type StoredRadarImportRow = {
  id: number;
  release_id: number;
  title: string;
  artist: string;
  year: number | null;
  date_added: string | null;
  local_priority: RadarPriority;
  local_target_price_eur: number | null;
  local_minimum_condition: RadarMinimumCondition | null;
  local_note: string | null;
  source_discogs: number;
  source_file: number;
};

type RadarWantlistApplyRow = Omit<RadarWantlistPreviewRow, 'target_price'> & {
  target_price_eur: number | null;
};

function normalizeImportedText(value: string | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeImportedPrice(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(2));
}

function insertRadarWantlistRow(
  db: Database.Database,
  userId: number,
  row: RadarWantlistApplyRow,
  importedAt: string,
): void {
  db.prepare(`
    INSERT INTO radar_releases (
      user_id,
      release_id,
      title,
      artist,
      year,
      date_added,
      local_priority,
      local_target_price_eur,
      local_minimum_condition,
      local_note,
      source_discogs,
      source_file,
      source_status,
      source_last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
  `).run(
    userId,
    row.release_id,
    normalizeImportedText(row.title) ?? '-',
    normalizeImportedText(row.artist) ?? '-',
    row.year,
    row.date_added,
    row.priority ?? RADAR_PRIORITY.NORMAL,
    normalizeImportedPrice(row.target_price_eur),
    row.minimum_condition,
    normalizeImportedText(row.notes) ?? '',
    RADAR_SOURCE_STATUS.ACTIVE,
    importedAt,
  );
}

function updateRadarWantlistRow(
  db: Database.Database,
  existing: StoredRadarImportRow,
  row: RadarWantlistApplyRow,
  importedAt: string,
): void {
  const keepsDiscogsMetadata = existing.source_discogs === 1;
  const nextTitle = keepsDiscogsMetadata ? existing.title : normalizeImportedText(row.title) ?? existing.title;
  const nextArtist = keepsDiscogsMetadata ? existing.artist : normalizeImportedText(row.artist) ?? existing.artist;
  const nextYear = keepsDiscogsMetadata ? existing.year : row.year ?? existing.year;

  db.prepare(`
    UPDATE radar_releases
    SET title = ?,
        artist = ?,
        year = ?,
        date_added = ?,
        local_priority = ?,
        local_target_price_eur = ?,
        local_minimum_condition = ?,
        local_note = ?,
        source_file = 1,
        source_status = ?,
        source_last_seen_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nextTitle,
    nextArtist,
    nextYear,
    row.date_added ?? existing.date_added,
    row.priority ?? existing.local_priority,
    row.target_price_eur == null ? existing.local_target_price_eur : normalizeImportedPrice(row.target_price_eur),
    row.minimum_condition ?? existing.local_minimum_condition,
    row.notes == null ? normalizeImportedText(existing.local_note) ?? '' : normalizeImportedText(row.notes) ?? '',
    RADAR_SOURCE_STATUS.ACTIVE,
    importedAt,
    existing.id,
  );
}

export function applyRadarWantlistImport(
  db: Database.Database,
  userId: number,
  rows: RadarWantlistApplyRow[],
  importedAt = new Date().toISOString(),
): RadarWantlistApplyResult {
  const applyTx = db.transaction((
    targetUserId: number,
    targetRows: RadarWantlistApplyRow[],
    targetImportedAt: string,
  ) => {
    let added = 0;
    let updated = 0;

    const selectExisting = db.prepare<[number, number], StoredRadarImportRow>(`
      SELECT
        id,
        release_id,
        title,
        artist,
        year,
        date_added,
        local_priority,
        local_target_price_eur,
        local_minimum_condition,
        local_note,
        source_discogs,
        source_file
      FROM radar_releases
      WHERE user_id = ? AND release_id = ?
    `);

    for (const row of targetRows) {
      const existing = selectExisting.get(targetUserId, row.release_id);

      if (!existing) {
        insertRadarWantlistRow(db, targetUserId, row, targetImportedAt);
        added += 1;
        continue;
      }

      updateRadarWantlistRow(db, existing, row, targetImportedAt);
      updated += 1;
    }

    return {
      totalRows: targetRows.length,
      imported: targetRows.length,
      skipped: 0,
      added,
      updated,
    };
  });

  return applyTx(userId, rows, importedAt);
}
