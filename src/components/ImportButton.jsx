import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  getImportResultHelpKey,
  getImportResultTitleKey,
  getImportResultTone,
  isTerminalImportStatus
} from '../lib/importSync';
import { useI18n } from '../lib/I18nContext';

const POLL_MS = 2000;
const MAX_POLL_ERRORS = 3;

function truncate(text, max = 40) {
  if (!text || text.length <= max) return text || '';
  return `${text.slice(0, max)}...`;
}

function ImportButton({ disabled = false }) {
  const { t } = useI18n();
  // idle | loading | preview | applying | syncing | result
  const [phase, setPhase] = useState('idle');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [syncState, setSyncState] = useState(null);
  const fileRef = useRef(null);
  const disposed = useRef(false);
  const pollTimer = useRef(null);
  const pollFailures = useRef(0);

  function clearPollTimer() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function queuePoll() {
    clearPollTimer();
    pollTimer.current = setTimeout(poll, POLL_MS);
  }

  const poll = useCallback(async () => {
    if (disposed.current) return;
    try {
      const status = await api.getImportStatus();
      pollFailures.current = 0;
      setStatusError('');
      setSyncState(status);
      if (status.status === 'running') {
        queuePoll();
        return;
      }
      if (status.status === 'idle') {
        queuePoll();
        return;
      }
      setPhase('result');
    } catch (err) {
      pollFailures.current += 1;
      if (pollFailures.current < MAX_POLL_ERRORS) {
        queuePoll();
        return;
      }

      setStatusError(t('collection.importStatusError', { error: err.message }));
    }
  }, [t]);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      clearPollTimer();
    };
  }, []);

  function reset() {
    clearPollTimer();
    pollFailures.current = 0;
    setPhase('idle');
    setPreview(null);
    setError('');
    setStatusError('');
    setSyncState(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhase('loading');
    setError('');

    try {
      const result = await api.importPreview(file);
      setPreview(result);

      if (!result.withChanges && !result.errors?.length) {
        setError(result.message || t('collection.noChanges'));
        setPhase('idle');
      } else {
        setPhase('preview');
      }
    } catch (err) {
      setError(err.message);
      setPhase('idle');
    }

    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleApply() {
    if (!preview?.previewId) return;
    setPhase('applying');
    setError('');
    setStatusError('');
    pollFailures.current = 0;

    try {
      const result = await api.importApply(preview.previewId);
      setSyncState(result.syncState || null);
      if (isTerminalImportStatus(result.syncState?.status)) {
        setPhase('result');
      } else {
        setPhase('syncing');
        queuePoll();
      }
    } catch (err) {
      setError(err.message);
      setPhase('preview');
    }
  }

  function retryStatusPoll() {
    setStatusError('');
    pollFailures.current = 0;
    void poll();
  }

  const syncProgress = syncState?.total
    ? Math.min(100, Math.round((syncState.current / syncState.total) * 100))
    : 0;
  const resultTone = getImportResultTone(syncState?.status);
  const resultTitleKey = getImportResultTitleKey(syncState?.status);
  const resultHelpKey = getImportResultHelpKey(syncState?.status);
  const visibleFailures = (syncState?.failures || []).slice(0, 5);
  const remainingFailures = Math.max(0, (syncState?.failures?.length || 0) - visibleFailures.length);
  const resultBoxClass = resultTone === 'success'
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    : resultTone === 'warning'
      ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
      : resultTone === 'error'
        ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
        : 'border-white/10 bg-white/5 text-slate-100';

  return (
    <div className="space-y-4">
      {phase === 'idle' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className={`secondary-button cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
              {t('collection.import')}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileSelect}
                className="hidden"
                disabled={disabled}
              />
            </label>
            <button
              type="button"
              onClick={() => api.downloadImportTemplate()}
              className="secondary-button"
            >
              {t('collection.downloadTemplate')}
            </button>
          </div>
          <p className="text-sm text-slate-400">
            {t('collection.importDescription')}
          </p>
        </div>
      )}

      {phase === 'loading' && (
        <div className="glass-panel p-5 text-center text-slate-300">
          {t('collection.importLoading')}
        </div>
      )}

      {phase === 'preview' && preview && (
        <div className="glass-panel space-y-4 p-5">
          <div>
            <h3 className="font-display text-xl text-white">{t('collection.previewTitle')}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {t('collection.previewSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              {t('collection.matched', { count: preview.matched })}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
              {t('collection.withChanges', { count: preview.withChanges })}
            </span>
            {preview.unmatched > 0 && (
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-200">
                  {t('collection.unmatched', { count: preview.unmatched })}
              </span>
            )}
          </div>

          {preview.unmatched > 0 && (
            <p className="text-sm text-amber-200/80">
              {t('collection.unmatchedHelp', { count: preview.unmatched })}
            </p>
          )}

          {preview.errors?.length > 0 && (
            <div className="space-y-1">
              {preview.errors.map((err, i) => (
                <p key={i} className="text-sm text-rose-300">
                  {t('collection.rowError', { row: err.row, column: err.column, value: err.value, reason: err.reason })}
                </p>
              ))}
            </div>
          )}

          {preview.changes.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/5">
              <div className="max-h-80 overflow-y-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900/95 text-slate-400">
                    <tr>
                       <th className="px-4 py-3">{t('collection.artist')}</th>
                       <th className="px-4 py-3">{t('collection.titleColumn')}</th>
                       <th className="px-4 py-3">{t('collection.rating')}</th>
                       <th className="px-4 py-3">{t('collection.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((change) => (
                      <tr key={change.dbId} className="border-t border-white/5 text-slate-200">
                        <td className="px-4 py-2">{change.artist}</td>
                        <td className="px-4 py-2">{truncate(change.title, 30)}</td>
                        <td className="px-4 py-2">
                          {change.ratingChanged ? (
                            <span>
                              <span className="text-slate-400">{change.currentRating}</span>
                              <span className="text-slate-500"> → </span>
                              <span className="text-emerald-300">{change.newRating}</span>
                            </span>
                          ) : (
                             <span className="text-slate-500">{t('collection.noChanges')}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {change.notesChanged ? (
                            <span>
                              <span className="text-slate-400" title={change.currentNotes}>{truncate(change.currentNotes, 20)}</span>
                              <span className="text-slate-500"> → </span>
                              <span className="text-emerald-300" title={change.newNotes}>{truncate(change.newNotes, 20)}</span>
                            </span>
                          ) : (
                             <span className="text-slate-500">{t('collection.noChanges')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={reset} className="secondary-button">
              {t('collection.cancel')}
            </button>
            <button type="button" onClick={handleApply} className="primary-button" disabled={!preview.withChanges}>
              {t('collection.applyChanges', { count: preview.withChanges })}
            </button>
          </div>
        </div>
      )}

      {phase === 'applying' && (
        <div className="glass-panel p-5 text-center text-slate-300">
          {t('collection.applying')}
        </div>
      )}

      {phase === 'syncing' && syncState && (
        <div className="glass-panel space-y-3 p-5">
          <div>
            <h3 className="font-display text-xl text-white">{t('collection.syncingTitle')}</h3>
            <p className="mt-1 text-sm text-slate-300">{syncState.message}</p>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-slate-900/80">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500" style={{ width: `${syncProgress}%` }} />
          </div>

          <p className="text-sm text-slate-400">
            {t('collection.canClose')}
          </p>

          {statusError ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <p>{statusError}</p>
              <button type="button" onClick={retryStatusPoll} className="secondary-button">
                {t('collection.retryStatus')}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {phase === 'result' && syncState && (
        <div className="glass-panel space-y-3 p-5">
          <div className={`rounded-2xl border px-4 py-3 text-sm ${resultBoxClass}`}>
            <p className="font-medium">{t(resultTitleKey)}</p>
            <p className="mt-1">{syncState.message || t('collection.done')}</p>
          </div>

          {resultHelpKey ? (
            <p className="text-sm text-slate-300">{t(resultHelpKey)}</p>
          ) : null}

          {visibleFailures.length > 0 && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
              <p className="text-sm font-medium text-rose-100">{t('collection.importFailuresTitle')}</p>
              <div className="mt-3 space-y-2">
                {visibleFailures.map((failure) => (
                  <div key={`${failure.dbId}-${failure.releaseId}-${failure.instanceId}`} className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                    <p className="font-medium text-slate-100">{failure.artist} - {failure.title}</p>
                    <p className="mt-1 text-slate-300">{failure.reason}</p>
                  </div>
                ))}
              </div>
              {remainingFailures > 0 ? (
                <p className="mt-3 text-sm text-slate-400">{t('collection.importMoreFailures', { count: remainingFailures })}</p>
              ) : null}
            </div>
          )}

          <button type="button" onClick={reset} className="secondary-button">
            {t('collection.close')}
          </button>
        </div>
      )}

      {error && phase === 'idle' && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
    </div>
  );
}

export default ImportButton;
