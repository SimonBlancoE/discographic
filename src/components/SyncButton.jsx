import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

const POLL_MS = 2000;

function SyncButton({ onSyncComplete, disabled = false }) {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const waitingForCompletion = useRef(false);
  const disposed = useRef(false);
  const syncToastShown = useRef(false);
  const enrichToastShown = useRef(false);
  const syncing = status?.status === 'running';
  const pendingValues = status?.enrichment?.pending || 0;
  const thumbsRunning = status?.thumbnails?.status === 'running';

  const progress = useMemo(() => {
    if (!syncing || !status?.total) return 0;
    return Math.min(100, Math.round((status.current / status.total) * 100));
  }, [status, syncing]);

  const onSyncCompleteRef = useRef(onSyncComplete);
  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  const poll = useCallback(async () => {
    if (disposed.current) return;
    try {
      const next = await api.getSyncStatus();
      if (disposed.current) return;
      setStatus(next);

      if (next.status === 'running') {
        waitingForCompletion.current = true;
        setTimeout(poll, POLL_MS);
      } else if (next.status === 'completed' && waitingForCompletion.current) {
        waitingForCompletion.current = false;
        if (!syncToastShown.current) {
          syncToastShown.current = true;
          toast.success(next.message || t('sync.completed'));
        }
        onSyncCompleteRef.current?.();
      }
    } catch {
      if (waitingForCompletion.current) {
        setTimeout(poll, POLL_MS);
      }
    }
  }, []);

  useEffect(() => {
    disposed.current = false;
    api.getSyncStatus().then((s) => {
      if (!disposed.current) {
        setStatus(s);
        if (s.status === 'running') {
          waitingForCompletion.current = true;
          setTimeout(poll, POLL_MS);
        }
      }
    }).catch(() => {});

    return () => {
      disposed.current = true;
    };
  }, [poll]);

  async function handleSync() {
    try {
      await api.startSync();
      syncToastShown.current = false;
      waitingForCompletion.current = true;
      const next = await api.getSyncStatus();
      setStatus(next);
      setTimeout(poll, POLL_MS);
    } catch (error) {
      toast.error(t('sync.startError', { error: error.message }));
    }
  }

  const enrichStatus = status?.enrichment?.status;
  const enrichRunning = enrichStatus === 'running';

  const enrichProgress = useMemo(() => {
    if (!enrichRunning || !status?.enrichment?.total) return 0;
    return Math.min(100, Math.round((status.enrichment.current / status.enrichment.total) * 100));
  }, [status, enrichRunning]);

  const pollEnrich = useCallback(async () => {
    if (disposed.current) return;
    try {
      const next = await api.getSyncStatus();
      if (disposed.current) return;
      setStatus(next);
      if (next.enrichment?.status === 'running') {
        setTimeout(pollEnrich, POLL_MS);
      } else if (next.enrichment?.status === 'completed') {
        if (!enrichToastShown.current) {
          enrichToastShown.current = true;
          toast.success(next.enrichment?.message || t('sync.enrichCompleted'));
        }
        onSyncCompleteRef.current?.();
      }
    } catch {
      setTimeout(pollEnrich, POLL_MS);
    }
  }, []);

  useEffect(() => {
    if (enrichRunning) {
      const timer = setTimeout(pollEnrich, POLL_MS);
      return () => clearTimeout(timer);
    }
  }, [enrichRunning, pollEnrich]);

  async function handleEnrich() {
    try {
      await api.enrichValues();
      enrichToastShown.current = false;
      setTimeout(pollEnrich, POLL_MS);
    } catch (error) {
      toast.error(t('sync.enrichStartError', { error: error.message }));
    }
  }

  async function handleStopEnrich() {
    try {
      await api.stopEnrich();
      const next = await api.getSyncStatus();
      setStatus(next);
    } catch {}
  }

  return (
    <div className="glass-panel w-full max-w-md p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">{t('sync.title')}</p>
          <p className="text-sm text-slate-300">{status?.message || t('sync.ready')}</p>
        </div>
        <button type="button" onClick={handleSync} disabled={syncing || disabled} className="primary-button disabled:cursor-not-allowed disabled:opacity-60">
          {syncing ? t('sync.running') : t('sync.start')}
        </button>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-900/80">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{t(`sync.phase.${status?.phase || 'idle'}`)}</span>
        <span>{status?.current || 0} / {status?.total || 0}</span>
      </div>

      {(pendingValues > 0 || enrichRunning) && !syncing && (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-300">
              {enrichRunning
                ? status.enrichment.message
                 : t('sync.pendingEnrich', { count: pendingValues })}
            </span>
            {enrichRunning ? (
              <button type="button" onClick={handleStopEnrich} className="secondary-button text-sm">
                {t('sync.stop')}
              </button>
            ) : (
              <button type="button" onClick={handleEnrich} disabled={disabled} className="secondary-button text-sm disabled:opacity-50">
                {t('sync.enrichValues')}
              </button>
            )}
          </div>
          {enrichRunning && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500" style={{ width: `${enrichProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {thumbsRunning && !syncing ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
            <span>{status.thumbnails.message}</span>
            <span className="text-xs text-slate-500">{t('sync.mosaicPoster')}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-400 transition-all duration-500" style={{ width: `${status.thumbnails.total ? Math.round((status.thumbnails.current / status.thumbnails.total) * 100) : 0}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SyncButton;
