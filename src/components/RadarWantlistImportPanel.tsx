import { useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useI18n } from '../lib/I18nContext';
import type { RadarWantlistPreviewResponse, RadarWantlistTemplateFormat } from '../lib/types';

type ImportPhase = 'idle' | 'loading' | 'preview';

function renderCountPill(text: string, className: string) {
  return (
    <span className={`rounded-full border px-3 py-1 text-sm ${className}`}>
      {text}
    </span>
  );
}

function RadarWantlistImportPanel() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [preview, setPreview] = useState<RadarWantlistPreviewResponse | null>(null);
  const [error, setError] = useState('');

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPhase('loading');
    setError('');

    try {
      const nextPreview = await api.previewRadarWantlist(file);
      setPreview(nextPreview);
      setPhase('preview');
    } catch (nextError) {
      setPreview(null);
      setError(getErrorMessage(nextError, t('client.networkError')));
      setPhase('idle');
    }

    event.target.value = '';
  }

  function downloadTemplate(format: RadarWantlistTemplateFormat) {
    api.downloadRadarWantlistTemplate(format);
  }

  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/30 p-6">
      <div className="space-y-2">
        <h2 className="font-display text-3xl text-white">{t('radar.import.title')}</h2>
        <p className="max-w-3xl text-sm text-slate-300">{t('radar.import.description')}</p>
        <p className="text-sm text-slate-400">{t('radar.import.requiredHint')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="secondary-button cursor-pointer">
          {t('radar.import.upload')}
          <input type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" />
        </label>
        <button type="button" className="secondary-button" onClick={() => downloadTemplate('csv')}>
          {t('radar.import.downloadCsvTemplate')}
        </button>
        <button type="button" className="secondary-button" onClick={() => downloadTemplate('xlsx')}>
          {t('radar.import.downloadXlsxTemplate')}
        </button>
      </div>

      {phase === 'loading' ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {t('radar.import.loading')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {phase === 'preview' && preview ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <div className="space-y-3">
            <h3 className="font-display text-2xl text-white">{t('radar.import.previewTitle')}</h3>
            <div className="flex flex-wrap gap-3">
              {renderCountPill(t('radar.import.totalRows', { count: preview.summary.totalRows }), 'border-white/10 bg-white/5 text-slate-200')}
              {renderCountPill(t('radar.import.validRows', { count: preview.summary.validRows }), 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200')}
              {renderCountPill(t('radar.import.invalidRows', { count: preview.summary.invalidRows }), 'border-amber-400/20 bg-amber-500/10 text-amber-200')}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm uppercase tracking-[0.25em] text-slate-400">{t('radar.import.mappedColumns')}</h4>
              <div className="flex flex-wrap gap-2">
                {preview.mappedColumns.map((column) => (
                  <span key={`${column.key}-${column.header}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                    {column.header}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm uppercase tracking-[0.25em] text-slate-400">{t('radar.import.ignoredColumns')}</h4>
              <div className="flex flex-wrap gap-2">
                {preview.ignoredColumns.length > 0 ? preview.ignoredColumns.map((column) => (
                  <span key={column} className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-sm text-amber-200">
                    {column}
                  </span>
                )) : (
                  <span className="text-sm text-slate-500">-</span>
                )}
              </div>
            </div>
          </div>

          {preview.errors.length > 0 ? (
            <div className="space-y-2">
              {preview.errors.map((entry) => (
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
          ) : null}

          <div className="space-y-3">
            <h4 className="text-sm uppercase tracking-[0.25em] text-slate-400">{t('radar.import.previewRows')}</h4>
            <div className="overflow-hidden rounded-2xl border border-white/5">
              <div className="max-h-72 overflow-y-auto">
                <table className="min-w-full text-left text-sm">
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
                    {preview.rows.map((row) => (
                      <tr key={`${row.row}-${row.release_id}`} className="border-t border-white/5 text-slate-200">
                        <td className="px-4 py-2">{row.release_id}</td>
                        <td className="px-4 py-2">{row.artist ?? '-'}</td>
                        <td className="px-4 py-2">{row.title ?? '-'}</td>
                        <td className="px-4 py-2">{row.year ?? '-'}</td>
                        <td className="px-4 py-2">{row.priority ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default RadarWantlistImportPanel;
