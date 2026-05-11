import { describe, it, expect } from 'vitest';
import { messages } from '../shared/i18n.js';

const { COLUMNS } = await import('../src/lib/columns.js') as {
  COLUMNS: Array<{
    i18nKey: string;
  }>;
};

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

const COLLECTION_PRICE_STATUS_KEYS = [
  'collection.pricePending',
  'collection.priceFailed',
  'collection.priceUnavailable',
  'collection.priceUnknown'
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

const RADAR_KEYS = [
  'nav.radar',
  'radar.eyebrow',
  'radar.blockedTitle',
  'radar.blockedBody',
  'radar.openSettings',
  'radar.accountUnavailable',
  'radar.loading',
  'radar.loadFailed',
  'radar.syncAction',
  'radar.syncing',
  'radar.syncResultTitle',
  'radar.syncResultSummary',
  'radar.syncBreakdown',
  'radar.syncError',
  'radar.summary.total',
  'radar.summary.active',
  'radar.summary.hidden',
  'radar.summary.resolved',
  'radar.summary.missingFromSource',
  'radar.summary.priced',
  'radar.summary.pending',
  'radar.summary.failed',
  'radar.summary.unavailable',
  'radar.filtersTitle',
  'radar.filter.all',
  'radar.filter.opportunities',
  'radar.filter.belowTarget',
  'radar.filter.highPriority',
  'radar.filter.inCollection',
  'radar.filter.hiddenResolved',
  'radar.filter.pending',
  'radar.filter.failed',
  'radar.filterEmptyTitle',
  'radar.filterEmptyBody',
  'radar.enrichTitle',
  'radar.enrichBody',
  'radar.enrichState.idle',
  'radar.enrichState.running',
  'radar.enrichState.completed',
  'radar.enrichState.failed',
  'radar.enrichState.stopped',
  'radar.enrichStart',
  'radar.enrichStop',
  'radar.enrichStatus',
  'radar.enrichCurrent',
  'radar.enrichTotal',
  'radar.enrichPending',
  'radar.enrichStatusError',
  'radar.emptyTitle',
  'radar.emptyBody',
  'radar.openDiscogs',
  'radar.priority',
  'radar.priority.low',
  'radar.priority.normal',
  'radar.priority.high',
  'radar.targetPrice',
  'radar.state.pending',
  'radar.state.unavailable',
  'radar.state.failed',
  'radar.state.hidden',
  'radar.state.resolved',
  'radar.state.missingFromSource',
  'radar.opportunity.below_target',
  'radar.opportunity.high_priority_available',
  'radar.opportunity.available_again',
  'radar.opportunity.already_in_collection',
  'radar.minimumCondition',
  'radar.minimumCondition.info',
  'radar.minimumCondition.none',
  'radar.minimumCondition.M',
  'radar.minimumCondition.NM',
  'radar.minimumCondition.VG+',
  'radar.minimumCondition.VG',
  'radar.minimumCondition.G+',
  'radar.minimumCondition.G',
  'radar.minimumCondition.F',
  'radar.minimumCondition.P',
  'radar.note',
  'radar.hidden',
  'radar.resolved',
  'radar.save',
  'radar.saving',
  'radar.saveFailed'
];

const NATURAL_RADAR_LABELS = [
  {
    key: 'radar.opportunity.below_target',
    es: 'Por debajo del precio objetivo',
    en: 'Below target price'
  },
  {
    key: 'radar.opportunity.high_priority_available',
    es: 'Alta prioridad con copia disponible',
    en: 'High priority with copy available'
  },
  {
    key: 'radar.opportunity.available_again',
    es: 'Disponible de nuevo',
    en: 'Available again'
  },
  {
    key: 'radar.opportunity.already_in_collection',
    es: 'Ya en tu colección',
    en: 'Already in your collection'
  },
  {
    key: 'radar.state.pending',
    es: 'Pendiente de actualizar',
    en: 'Pending update'
  },
  {
    key: 'radar.state.unavailable',
    es: 'Sin precio disponible',
    en: 'No price available'
  },
  {
    key: 'radar.state.failed',
    es: 'Actualización fallida',
    en: 'Update failed'
  },
  {
    key: 'radar.state.hidden',
    es: 'Oculto',
    en: 'Hidden'
  },
  {
    key: 'radar.state.resolved',
    es: 'Resuelto',
    en: 'Resolved'
  },
  {
    key: 'radar.state.missingFromSource',
    es: 'Fuera de fuente',
    en: 'Missing from source'
  }
] as const;

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

const DASHBOARD_RADAR_KEYS = [
  'dashboard.radarTitle',
  'dashboard.radarBody',
  'dashboard.radarOpen',
  'dashboard.radar.totalWanted',
  'dashboard.radar.activeOpportunities',
  'dashboard.radar.belowTarget',
  'dashboard.radar.alreadyOwned'
];

const PRICE_REVIEW_COPY = [
  {
    key: 'radar.enrichTitle',
    es: 'Revisión de precios de Radar',
    en: 'Radar price review'
  },
  {
    key: 'radar.enrichBody',
    es: 'Revisa los precios mínimos por release de tu Wantlist y conserva los estados pendientes, fallidos y sin precio para que los reintentos sigan siendo fieles.',
    en: 'Review release-level minimum prices for your Wantlist and preserve pending, failed, and no-price states so retries stay truthful.'
  },
  {
    key: 'radar.enrichStart',
    es: 'Revisar precios',
    en: 'Review prices'
  },
  {
    key: 'radar.enrichStatusError',
    es: 'No se pudo cargar el estado de revisión de precios de Radar. Vuelve a intentarlo en un momento.',
    en: 'Radar price review status could not be loaded. Try again in a moment.'
  },
  {
    key: 'dashboard.noValues',
    es: 'Aún no hay valores individuales en caché. Aparecerán cuando se revisen los precios de los discos con datos de Discogs.',
    en: 'There are no individual cached values yet. They will appear once record prices are reviewed with Discogs data.'
  },
  {
    key: 'sync.enrichCompleted',
    es: 'Revisión de precios completada.',
    en: 'Price review completed.'
  },
  {
    key: 'sync.enrichStartError',
    es: 'No se pudo iniciar la revisión de precios: {error}',
    en: 'Unable to start price review: {error}'
  },
  {
    key: 'sync.stopError',
    es: 'No se pudo detener la revisión de precios: {error}',
    en: 'Unable to stop price review: {error}'
  },
  {
    key: 'sync.enrichValues',
    es: 'Actualizar precios',
    en: 'Update prices'
  },
  {
    key: 'sync.pendingEnrich',
    es: '{count} discos pendientes de revisar precios',
    en: '{count} records pending price review'
  },
  {
    key: 'backend.sync.activeEnrich',
    es: 'Ya hay una revisión de precios en curso',
    en: 'A price review is already running'
  },
  {
    key: 'backend.sync.pending',
    es: '{count} discos pendientes de revisar (precio, país, lista de temas).',
    en: '{count} records pending review (price, country, tracklist).'
  },
  {
    key: 'backend.sync.enrichProgress',
    es: 'Revisando {current}/{total}...',
    en: 'Reviewing {current}/{total}...'
  },
  {
    key: 'backend.sync.enrichRemaining',
    es: '{processed} discos revisados. Quedan {pending} pendientes.',
    en: '{processed} records reviewed. {pending} still pending.'
  },
  {
    key: 'backend.sync.enrichDone',
    es: '{processed} discos revisados. Completado.',
    en: '{processed} records reviewed. Completed.'
  },
  {
    key: 'backend.radar.activeEnrich',
    es: 'Ya hay una revisión de precios de Radar en curso',
    en: 'A Radar price review is already running'
  },
  {
    key: 'backend.radar.ready',
    es: 'Radar listo para revisar precios de la Wantlist.',
    en: 'Radar is ready to review Wantlist prices.'
  },
  {
    key: 'backend.radar.enrichProgress',
    es: 'Revisando precios de Radar {current}/{total}...',
    en: 'Reviewing Radar prices {current}/{total}...'
  },
  {
    key: 'backend.radar.enrichRemaining',
    es: '{processed} releases deseados revisados. {pending} siguen pendientes o fallidos.',
    en: '{processed} wanted releases reviewed. {pending} remain pending or failed.'
  },
  {
    key: 'backend.radar.enrichDone',
    es: '{processed} releases deseados revisados. Completado.',
    en: '{processed} wanted releases reviewed. Completed.'
  },
  {
    key: 'backend.radar.enrichStopped',
    es: 'Radar detenido tras revisar {processed} releases. {pending} siguen pendientes o fallidos.',
    en: 'Radar stopped after reviewing {processed} releases. {pending} remain pending or failed.'
  }
] as const;

const PRICE_REVIEW_JARGON_PATTERN = /enriquec|enrichment|enriching|enrich\b/i;

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

  it('has marketplace price status labels in both locales', () => {
    for (const key of COLLECTION_PRICE_STATUS_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }

    expect(messages.es['collection.pricePending']).toBe('Pendiente');
    expect(messages.en['collection.pricePending']).toBe('Pending');
    expect(messages.es['collection.priceFailed']).toBe('Error');
    expect(messages.en['collection.priceFailed']).toBe('Failed');
    expect(messages.es['collection.priceUnavailable']).toBe('No disponible');
    expect(messages.en['collection.priceUnavailable']).toBe('Unavailable');
    expect(messages.es['collection.priceUnknown']).toBe('Desconocido');
    expect(messages.en['collection.priceUnknown']).toBe('Unknown');
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

  it('all Radar page keys exist in both locales', () => {
    for (const key of RADAR_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('uses natural Radar labels in Spanish and English', () => {
    for (const label of NATURAL_RADAR_LABELS) {
      expect(messages.es[label.key]).toBe(label.es);
      expect(messages.en[label.key]).toBe(label.en);
    }
  });

  it('uses price-review language across Radar, sync, and collection copy', () => {
    for (const { key, es, en } of PRICE_REVIEW_COPY) {
      expect(messages.es[key]).toBe(es);
      expect(messages.en[key]).toBe(en);
      expect(messages.es[key]).not.toMatch(PRICE_REVIEW_JARGON_PATTERN);
      expect(messages.en[key]).not.toMatch(PRICE_REVIEW_JARGON_PATTERN);
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

  it('has Dashboard Radar summary keys in both locales', () => {
    for (const key of DASHBOARD_RADAR_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('uses collector-facing dashboard coverage copy', () => {
    expect(messages.es['dashboard.coverageSubtitle']).toBe('Consulta cuánto de tu colección está documentado y qué discos aún necesitan valoración, notas o precio de mercado.');
    expect(messages.en['dashboard.coverageSubtitle']).toBe('See how much of your collection is documented and which records still need ratings, notes, or market data.');
    expect(messages.es['dashboard.coverageSubtitle']).not.toMatch(/rehecho/i);
    expect(messages.en['dashboard.coverageSubtitle']).not.toMatch(/rebuilt/i);
  });
});
