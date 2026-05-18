import { useRef, useState, type ChangeEvent, type Ref } from 'react';
import type { RadarResponse } from '../../shared/contracts/radar.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useI18n } from '../lib/I18nContext';
import type {
  RadarWantlistApplyResponse,
  RadarWantlistPreviewResponse,
  RadarWantlistTemplateFormat,
  Translate,
} from '../lib/types';

type ImportPhase = 'idle' | 'loading' | 'preview' | 'applying';

type PreviewColumn = RadarWantlistPreviewResponse['mappedColumns'][number];
type PreviewError = RadarWantlistPreviewResponse['errors'][number];
type PreviewRow = RadarWantlistPreviewResponse['rows'][number];

type ChipItem = {
  key: string;
  label: string;
};

const EMPTY_PREVIEW_CELL = '-';

function CountPill({ text, className }: { text: string; className: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-sm ${className}`}>
      {text}
    </span>
  );
}

function toMappedColumnChips(columns: PreviewColumn[]): ChipItem[] {
  return columns.map((column) => ({
    key: `${column.key}-${column.header}`,
    label: column.header,
  }));
}

function toIgnoredColumnChips(columns: string[]): ChipItem[] {
  return columns.map((column) => ({
    key: column,
    label: column,
  }));
}

function ColumnChipList({
  title,
  items,
  chipClassName,
  showEmptyPlaceholder = false,
}: {
  title: string;
  items: ChipItem[];
  chipClassName: string;
  showEmptyPlaceholder?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm uppercase tracking-[0.25em] text-slate-400">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? items.map((item) => (
          <span key={item.key} className={`rounded-full border px-3 py-1 text-sm ${chipClassName}`}>
            {item.label}
          </span>
        )) : showEmptyPlaceholder ? (
          <span className="text-sm text-slate-500">{EMPTY_PREVIEW_CELL}</span>
        ) : null}
      </div>
    </div>
  );
}

function PreviewSummary({ preview, t }: { preview: RadarWantlistPreviewResponse; t: Translate }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-2xl text-white">{t('radar.import.previewTitle')}</h3>
      <div className="flex flex-wrap gap-3">
        <CountPill
          text={t('radar.import.totalRows', { count: preview.summary.totalRows })}
          className="border-white/10 bg-white/5 text-slate-200"
        />
        <CountPill
          text={t('radar.import.validRows', { count: preview.summary.validRows })}
          className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
        />
        <CountPill
          text={t('radar.import.invalidRows', { count: preview.summary.invalidRows })}
          className="border-amber-400/20 bg-amber-500/10 text-amber-200"
        />
      </div>
    </div>
  );
}

function PreviewErrors({ errors, t }: { errors: PreviewError[]; t: Translate }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {errors.map((entry) => (
        <p key={`${entry.row}-${entry.column}-${entry.value}`} className="text-sm text-rose-300">
          {t('radar.import.rowError', {
            row: entry.row,
            column: entry.column,
            value: entry.value,
            reason: entry.reason,
          })}
        </p>
      ))}
    </div>
  );
}

function PreviewRowsTable({ rows, t }: { rows: PreviewRow[]; t: Translate }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm uppercase tracking-[0.25em] text-slate-400">{t('radar.import.previewRows')}</h4>
      <div className="overflow-hidden rounded-2xl border border-white/5">
        <div
          data-radar-import-preview-table="true"
          className="max-h-72 overflow-x-auto overflow-y-auto"
        >
          <table className="min-w-[40rem] w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-950/95 text-slate-400">
              <tr>
                <th className="px-4 py-3">release_id</th>
                <th className="px-4 py-3">{t('collection.artist')}</th>
                <th className="px-4 py-3">{t('collection.titleColumn')}</th>
                <th className="px-4 py-3">{t('collection.year')}</th>
                <th className="px-4 py-3">{t('radar.import.priorityColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.row}-${row.release_id}`} className="border-t border-white/5 text-slate-200">
                  <td className="px-4 py-2">{row.release_id}</td>
                  <td className="px-4 py-2">{row.artist ?? EMPTY_PREVIEW_CELL}</td>
                  <td className="px-4 py-2">{row.title ?? EMPTY_PREVIEW_CELL}</td>
                  <td className="px-4 py-2">{row.year ?? EMPTY_PREVIEW_CELL}</td>
                  <td className="px-4 py-2">{row.priority ?? EMPTY_PREVIEW_CELL}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WantlistPreview({ preview, t }: { preview: RadarWantlistPreviewResponse; t: Translate }) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <PreviewSummary preview={preview} t={t} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnChipList
          title={t('radar.import.mappedColumns')}
          items={toMappedColumnChips(preview.mappedColumns)}
          chipClassName="border-white/10 bg-white/5 text-slate-200"
        />
        <ColumnChipList
          title={t('radar.import.ignoredColumns')}
          items={toIgnoredColumnChips(preview.ignoredColumns)}
          chipClassName="border-amber-400/20 bg-amber-500/10 text-amber-200"
          showEmptyPlaceholder
        />
      </div>

      <PreviewErrors errors={preview.errors} t={t} />
      <PreviewRowsTable rows={preview.rows} t={t} />
    </div>
  );
}

function ApplyResultBanner({ result, t }: { result: RadarWantlistApplyResponse['result']; t: Translate }) {
  return (
    <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-100">
      <p className="text-sm">{t('radar.import.applySummary', { imported: result.imported, skipped: result.skipped })}</p>
      <p className="text-sm text-emerald-200/90">{t('radar.import.applyBreakdown', { added: result.added, updated: result.updated })}</p>
      <p className="text-sm text-emerald-50">{t('radar.import.applyNextStep')}</p>
    </div>
  );
}

type RadarWantlistImportPanelProps = {
  onApplied: (radar: RadarResponse) => void;
  sectionId?: string;
  sectionRef?: Ref<HTMLElement>;
  headingRef?: Ref<HTMLHeadingElement>;
};

function RadarWantlistImportPanel({
  onApplied,
  sectionId,
  sectionRef,
  headingRef,
}: RadarWantlistImportPanelProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [preview, setPreview] = useState<RadarWantlistPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<RadarWantlistApplyResponse['result'] | null>(null);
  const [error, setError] = useState('');
  const requestInFlightRef = useRef(false);
  const isBusy = phase === 'loading' || phase === 'applying';

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (requestInFlightRef.current) {
      event.target.value = '';
      return;
    }

    requestInFlightRef.current = true;
    setPhase('loading');
    setError('');
    setApplyResult(null);

    try {
      const nextPreview = await api.previewRadarWantlist(file);
      setPreview(nextPreview);
      setPhase('preview');
    } catch (nextError) {
      setPreview(null);
      setError(getErrorMessage(nextError, t('client.networkError')));
      setPhase('idle');
    } finally {
      requestInFlightRef.current = false;
      event.target.value = '';
    }
  }

  function downloadTemplate(format: RadarWantlistTemplateFormat) {
    if (requestInFlightRef.current) {
      return;
    }

    api.downloadRadarWantlistTemplate(format);
  }

  async function handleApplyPreview() {
    if (!preview?.previewId || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    setPhase('applying');
    setError('');

    try {
      const response = await api.applyRadarWantlistPreview(preview.previewId);
      setPreview((current) => current ? { ...current, previewId: null } : current);
      setApplyResult(response.result);
      onApplied(response.radar);
      setPhase('preview');
    } catch (nextError) {
      setError(t('radar.import.applyFailed', {
        error: getErrorMessage(nextError, t('client.networkError')),
      }));
      setPhase('preview');
    } finally {
      requestInFlightRef.current = false;
    }
  }

  return (
    <section
      id={sectionId}
      ref={sectionRef}
      className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/30 p-6"
    >
      <div className="space-y-2">
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl text-white outline-none">
          {t('radar.import.title')}
        </h2>
        <p className="max-w-3xl text-sm text-slate-300">{t('radar.import.description')}</p>
        <p className="text-sm text-slate-400">{t('radar.import.requiredHint')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className={`secondary-button ${isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          {t('radar.import.upload')}
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileSelect}
            disabled={isBusy}
            className="hidden"
          />
        </label>
        <button
          type="button"
          className="secondary-button disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => downloadTemplate('csv')}
          disabled={isBusy}
        >
          {t('radar.import.downloadCsvTemplate')}
        </button>
        <button
          type="button"
          className="secondary-button disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => downloadTemplate('xlsx')}
          disabled={isBusy}
        >
          {t('radar.import.downloadXlsxTemplate')}
        </button>
      </div>

      {phase === 'loading' ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {t('radar.import.loading')}
        </div>
      ) : null}

      {phase === 'applying' ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {t('radar.import.applying')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {applyResult ? <ApplyResultBanner result={applyResult} t={t} /> : null}

      {(phase === 'preview' || phase === 'applying') && preview ? (
        <div className="space-y-4">
          <WantlistPreview preview={preview} t={t} />
          <button
            type="button"
            onClick={() => void handleApplyPreview()}
            disabled={isBusy || !preview.previewId || preview.summary.validRows === 0}
            className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('radar.import.apply')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default RadarWantlistImportPanel;
