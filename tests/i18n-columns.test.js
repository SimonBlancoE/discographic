import { describe, it, expect } from 'vitest';
import { messages } from '../shared/i18n.js';
import { COLUMNS } from '../src/lib/columns.js';

const EXPORT_KEYS = [
  'export.id', 'export.releaseDiscogs', 'export.instance', 'export.artist',
  'export.title', 'export.year', 'export.genres', 'export.styles',
  'export.formats', 'export.labels', 'export.country', 'export.rating',
  'export.notes', 'export.dateAdded', 'export.minPrice', 'export.listingStatus',
  'export.listingPrice', 'export.tracks', 'export.sheetName'
];

const BACKEND_IMPORT_KEYS = [
  'backend.import.fileType',
  'backend.import.noSheets',
  'backend.import.noRows',
  'backend.import.idColumnRequired',
  'backend.import.editableColumnRequired',
  'backend.import.unmatched',
  'backend.import.invalidRating',
  'backend.import.idle',
  'backend.import.syncing',
  'backend.import.completed',
  'backend.import.partial',
  'backend.import.failedAll',
  'backend.import.interrupted',
  'backend.import.templateSheetName',
  'backend.import.templateArtistSample',
  'backend.import.templateTitleSample',
  'backend.import.templateNotesSample',
  'backend.import.fileRequired',
  'backend.import.noChangesDetected',
  'backend.import.previewIdRequired',
  'backend.import.previewExpired',
  'backend.import.localOnlyCompleted',
  'backend.import.releaseMissing',
  'backend.import.unknownSyncError',
  'backend.import.syncFailed'
];

const COLLECTION_IMPORT_RESULT_KEYS = [
  'collection.importCompletedTitle',
  'collection.importPartialTitle',
  'collection.importLocalOnlyTitle',
  'collection.importFailedTitle',
  'collection.importPartialHelp',
  'collection.importLocalOnlyHelp',
  'collection.importFailedHelp',
  'collection.importFailuresTitle',
  'collection.importMoreFailures'
];

const BACKEND_MEDIA_KEYS = [
  'backend.media.urlNotAllowed',
  'backend.media.remoteFetchFailed',
  'backend.media.coverUnavailable',
  'backend.media.coverDownloadFailed',
  'backend.media.releaseNotFound',
  'backend.media.noCovers',
  'backend.media.tapeteFailed'
];

const CLIENT_KEYS = [
  'client.networkError',
  'client.tapeteError'
];

const VISUAL_I18N_KEYS = [
  'app.badgeLabel',
  'dashboard.feature.previous',
  'dashboard.feature.next',
  'dashboard.feature.goTo',
  'dashboard.feature.charts.kicker',
  'dashboard.feature.charts.title',
  'dashboard.feature.charts.sub',
  'dashboard.feature.charts.where',
  'dashboard.feature.random.kicker',
  'dashboard.feature.random.title',
  'dashboard.feature.random.sub',
  'dashboard.feature.random.where',
  'dashboard.feature.curate.kicker',
  'dashboard.feature.curate.title',
  'dashboard.feature.curate.sub',
  'dashboard.feature.curate.where',
  'dashboard.feature.wall.kicker',
  'dashboard.feature.wall.title',
  'dashboard.feature.wall.sub',
  'dashboard.feature.wall.where',
  'dashboard.feature.export.kicker',
  'dashboard.feature.export.title',
  'dashboard.feature.export.sub',
  'dashboard.feature.export.where'
];

describe('i18n keys for table columns', () => {
  it('all column i18n keys exist in Spanish locale', () => {
    for (const col of COLUMNS) {
      expect(messages.es[col.i18nKey], `Missing es key: ${col.i18nKey}`).toBeTruthy();
    }
  });

  it('all column i18n keys exist in English locale', () => {
    for (const col of COLUMNS) {
      expect(messages.en[col.i18nKey], `Missing en key: ${col.i18nKey}`).toBeTruthy();
    }
  });

  it('has listing status key in both locales', () => {
    expect(messages.es['collection.listingStatus']).toBe('Estado venta');
    expect(messages.en['collection.listingStatus']).toBe('Listing');
  });

  it('has listing price key in both locales', () => {
    expect(messages.es['collection.listingPrice']).toBe('Mi precio');
    expect(messages.en['collection.listingPrice']).toBe('My price');
  });

  it('has collection.columns key in both locales', () => {
    expect(messages.es['collection.columns']).toBe('Columnas');
    expect(messages.en['collection.columns']).toBe('Columns');
  });

  it('has collection.currency key in both locales', () => {
    expect(messages.es['collection.currency']).toBe('Divisa');
    expect(messages.en['collection.currency']).toBe('Currency');
  });
});

describe('i18n keys for export headers', () => {
  it('all export keys exist in Spanish locale', () => {
    for (const key of EXPORT_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
    }
  });

  it('all export keys exist in English locale', () => {
    for (const key of EXPORT_KEYS) {
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('Spanish and English export headers differ where expected', () => {
    expect(messages.es['export.artist']).toBe('Artista');
    expect(messages.en['export.artist']).toBe('Artist');
    expect(messages.es['export.minPrice']).toBe('Precio mín.');
    expect(messages.en['export.minPrice']).toBe('Min. price');
    expect(messages.es['export.sheetName']).toBe('Colección');
    expect(messages.en['export.sheetName']).toBe('Collection');
  });
});

describe('i18n keys for import/media/client fallbacks', () => {
  it('all backend import keys exist in Spanish locale', () => {
    for (const key of BACKEND_IMPORT_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
    }
  });

  it('all backend import keys exist in English locale', () => {
    for (const key of BACKEND_IMPORT_KEYS) {
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('all collection import result keys exist in both locales', () => {
    for (const key of COLLECTION_IMPORT_RESULT_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('all backend media keys exist in both locales', () => {
    for (const key of BACKEND_MEDIA_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('all client fallback keys exist in both locales', () => {
    for (const key of CLIENT_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('localizes import template labels and sample copy', () => {
    expect(messages.es['backend.import.templateSheetName']).toBe('Importar');
    expect(messages.en['backend.import.templateSheetName']).toBe('Import');
    expect(messages.es['backend.import.templateNotesSample']).toContain('2024');
    expect(messages.en['backend.import.templateNotesSample']).toContain('2024');
  });

  it('has visual hero and badge keys in both locales', () => {
    for (const key of VISUAL_I18N_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });
});
