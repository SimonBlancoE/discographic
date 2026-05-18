/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarResponse } from '../shared/contracts/radar.js';
import RadarWantlistImportPanel from '../src/components/RadarWantlistImportPanel';

const previewRadarWantlist = vi.hoisted(() => vi.fn());
const applyRadarWantlistPreview = vi.hoisted(() => vi.fn());
const downloadRadarWantlistTemplate = vi.hoisted(() => vi.fn());

const messages = {
  'client.networkError': 'Network error',
  'radar.import.title': 'Wantlist fallback import',
  'radar.import.description': 'Use a file fallback.',
  'radar.import.requiredHint': 'Required: release_id.',
  'radar.import.upload': 'Upload CSV/XLSX',
  'radar.import.downloadCsvTemplate': 'CSV template',
  'radar.import.downloadXlsxTemplate': 'XLSX template',
  'radar.import.loading': 'Analyzing Wantlist file...',
  'radar.import.previewTitle': 'Wantlist preview',
  'radar.import.totalRows': '{count} rows',
  'radar.import.validRows': '{count} valid',
  'radar.import.invalidRows': '{count} invalid',
  'radar.import.mappedColumns': 'Mapped columns',
  'radar.import.ignoredColumns': 'Ignored columns',
  'radar.import.previewRows': 'Preview rows',
  'radar.import.apply': 'Import valid rows',
  'radar.import.applying': 'Importing preview...',
  'radar.import.applySummary': 'Imported {imported} valid rows. Skipped {skipped} invalid rows.',
  'radar.import.applyBreakdown': '{added} new · {updated} merged',
  'radar.import.applyNextStep': 'Radar was updated locally.',
  'radar.import.applyFailed': 'Radar could not import this preview: {error}',
  'radar.import.rowError': 'Row {row}, column {column}: {value} - {reason}',
  'collection.artist': 'Artist',
  'collection.titleColumn': 'Title',
  'collection.year': 'Year',
  'radar.import.priorityColumn': 'Priority',
} satisfies Record<string, string>;

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const template = messages[key as keyof typeof messages] ?? key;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    previewRadarWantlist,
    applyRadarWantlistPreview,
    downloadRadarWantlistTemplate,
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

const previewResponse = {
  previewId: 'preview-1',
  summary: {
    totalRows: 1,
    validRows: 1,
    invalidRows: 0,
  },
  mappedColumns: [
    { header: 'release_id', key: 'release_id', required: true },
  ],
  ignoredColumns: [],
  rows: [
    {
      row: 2,
      release_id: 12345,
      artist: 'Kraftwerk',
      title: 'Computer World',
      year: 1981,
      notes: null,
      date_added: null,
      target_price: null,
      minimum_condition: null,
      priority: 'normal',
    },
  ],
  errors: [],
};

const radarResponse: RadarResponse = {
  items: [],
  summary: {
    total: 0,
    active: 0,
    hidden: 0,
    resolved: 0,
    missingFromSource: 0,
    priced: 0,
    pending: 0,
    failed: 0,
    unavailable: 0,
  },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPanel(onApplied = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<RadarWantlistImportPanel onApplied={onApplied} />);
    await Promise.resolve();
  });

  return container;
}

async function selectFile(input: HTMLInputElement, fileName: string) {
  const file = new File(['release_id\n12345\n'], fileName, { type: 'text/csv' });
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

function getUploadInput(rendered: HTMLDivElement) {
  const input = rendered.querySelector('input[type="file"]') as HTMLInputElement | null;

  if (!input) {
    throw new Error('Missing upload input');
  }

  return input;
}

function getApplyButton(rendered: HTMLDivElement) {
  const button = Array.from(rendered.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === messages['radar.import.apply'],
  ) as HTMLButtonElement | undefined;

  if (!button) {
    throw new Error('Missing apply button');
  }

  return button;
}

describe('RadarWantlistImportPanel', () => {
  beforeEach(() => {
    previewRadarWantlist.mockReset();
    applyRadarWantlistPreview.mockReset();
    downloadRadarWantlistTemplate.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('serializes file preview requests while a selected file is still being analyzed', async () => {
    const preview = createDeferred<typeof previewResponse>();
    previewRadarWantlist.mockReturnValue(preview.promise);
    const rendered = await renderPanel();
    const input = getUploadInput(rendered);

    await selectFile(input, 'first.csv');
    expect(input.disabled).toBe(true);

    await selectFile(input, 'second.csv');

    expect(previewRadarWantlist).toHaveBeenCalledTimes(1);

    await act(async () => {
      preview.resolve(previewResponse);
      await preview.promise;
    });
  });

  it('serializes preview application while an apply request is still in flight', async () => {
    previewRadarWantlist.mockResolvedValue(previewResponse);
    const apply = createDeferred<{ ok: true; radar: RadarResponse; result: {
      totalRows: number;
      imported: number;
      skipped: number;
      added: number;
      updated: number;
    } }>();
    applyRadarWantlistPreview.mockReturnValue(apply.promise);
    const rendered = await renderPanel();
    const input = getUploadInput(rendered);

    await selectFile(input, 'wantlist.csv');

    const applyButton = getApplyButton(rendered);
    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(input.disabled).toBe(true);
    expect(applyButton.disabled).toBe(true);

    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(applyRadarWantlistPreview).toHaveBeenCalledTimes(1);

    await act(async () => {
      apply.resolve({
        ok: true,
        radar: radarResponse,
        result: {
          totalRows: 1,
          imported: 1,
          skipped: 0,
          added: 1,
          updated: 0,
        },
      });
      await apply.promise;
    });
  });
});
