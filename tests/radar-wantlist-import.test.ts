import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildRadarWantlistPreview,
  normalizeRadarWantlistHeader,
  parseRadarWantlistWorkbook,
} from '../server/services/radarWantlistImport.js';
import { RADAR_PRIORITY } from '../shared/contracts/radar.js';

type Translate = (key: string) => string;

const messages: Record<string, string> = {
  'backend.radarImport.fileType': 'Unsupported file type.',
  'backend.radarImport.noSheets': 'The file does not contain any sheets.',
  'backend.radarImport.noRows': 'The file does not contain any data rows.',
  'backend.radarImport.fileRequired': 'No file was received.',
  'backend.radarImport.releaseIdColumnRequired': 'A release_id column is required.',
  'backend.radarImport.invalidReleaseId': 'Release ID must be a positive integer.',
  'backend.radarImport.invalidYear': 'Year must be a whole number.',
  'backend.radarImport.invalidDateAdded': 'Date added must be a valid date.',
  'backend.radarImport.invalidTargetPrice': 'Target price must be a valid number.',
  'backend.radarImport.invalidPriority': 'Priority must be low, normal, or high.',
};

const t: Translate = (key) => messages[key] ?? key;

describe('radar wantlist import preview', () => {
  it('normalizes localized headers and reports ignored columns and invalid rows', () => {
    const csv = [
      'ID Discogs,Artista,Título,Año,Notas,Fecha de alta,Precio objetivo,Condición mínima,Prioridad,Color',
      '12345,Kraftwerk,Computer World,1981,Need clean copy,2026-05-10,18,VG+,Alta,red',
      'abc,Boards of Canada,Music Has the Right to Children,year??,too expensive,not-a-date,free,VG+,urgent,blue',
    ].join('\n');

    const preview = buildRadarWantlistPreview(parseRadarWantlistWorkbook(Buffer.from(csv), 'wantlist.csv', t), t);

    expect(normalizeRadarWantlistHeader('  Título  ')).toBe('titulo');
    expect(preview.summary).toEqual({
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
    });
    expect(preview.mappedColumns.map((column) => column.key)).toEqual([
      'release_id',
      'artist',
      'title',
      'year',
      'notes',
      'date_added',
      'target_price',
      'minimum_condition',
      'priority',
    ]);
    expect(preview.ignoredColumns).toEqual(['Color']);
    expect(preview.rows).toEqual([
      {
        row: 2,
        release_id: 12345,
        artist: 'Kraftwerk',
        title: 'Computer World',
        year: 1981,
        notes: 'Need clean copy',
        date_added: '2026-05-10',
        target_price: 18,
        minimum_condition: 'VG+',
        priority: RADAR_PRIORITY.HIGH,
      },
    ]);
    expect(preview.errors).toEqual([
      { row: 3, column: 'ID Discogs', value: 'abc', reason: messages['backend.radarImport.invalidReleaseId'] },
      { row: 3, column: 'Año', value: 'year??', reason: messages['backend.radarImport.invalidYear'] },
      { row: 3, column: 'Fecha de alta', value: 'not-a-date', reason: messages['backend.radarImport.invalidDateAdded'] },
      { row: 3, column: 'Precio objetivo', value: 'free', reason: messages['backend.radarImport.invalidTargetPrice'] },
      { row: 3, column: 'Prioridad', value: 'urgent', reason: messages['backend.radarImport.invalidPriority'] },
    ]);
  });
});

describe('radar wantlist import workbook parsing', () => {
  it('uses the first sheet for xlsx uploads', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { release_id: 456, artist: 'PJ Harvey' },
    ]), 'First');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { release_id: 999, artist: 'Wrong sheet' },
    ]), 'Second');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const preview = buildRadarWantlistPreview(parseRadarWantlistWorkbook(buffer, 'wantlist.xlsx', t), t);

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]?.release_id).toBe(456);
  });

  it('rejects files without a recognized release id column', () => {
    const csv = [
      'Artista,Título,Prioridad',
      'Air,Moon Safari,alta',
    ].join('\n');

    expect(() => buildRadarWantlistPreview(parseRadarWantlistWorkbook(Buffer.from(csv), 'wantlist.csv', t), t))
      .toThrow(messages['backend.radarImport.releaseIdColumnRequired']);
  });
});
