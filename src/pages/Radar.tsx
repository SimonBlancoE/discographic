import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  normalizeRadarResponse,
  type RadarLocalDecisionPayload,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
} from '../../shared/contracts/radar.js';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';
import { api } from '../lib/api';
import type { Translate } from '../lib/types';

const RADAR_SUMMARY_CARDS = [
  { labelKey: 'radar.summary.total', valueKey: 'total' },
  { labelKey: 'radar.summary.active', valueKey: 'active' },
  { labelKey: 'radar.summary.hidden', valueKey: 'hidden' },
  { labelKey: 'radar.summary.resolved', valueKey: 'resolved' },
  { labelKey: 'radar.summary.missingFromSource', valueKey: 'missingFromSource' },
  { labelKey: 'radar.summary.priced', valueKey: 'priced' },
  { labelKey: 'radar.summary.pending', valueKey: 'pending' },
  { labelKey: 'radar.summary.failed', valueKey: 'failed' },
  { labelKey: 'radar.summary.unavailable', valueKey: 'unavailable' },
] as const;

const RADAR_PRIORITY_OPTIONS: RadarPriority[] = [
  RADAR_PRIORITY.LOW,
  RADAR_PRIORITY.NORMAL,
  RADAR_PRIORITY.HIGH,
];

const RADAR_MINIMUM_CONDITION_OPTIONS = [
  RADAR_MINIMUM_CONDITION.MINT,
  RADAR_MINIMUM_CONDITION.NEAR_MINT,
  RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.VERY_GOOD,
  RADAR_MINIMUM_CONDITION.GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.GOOD,
  RADAR_MINIMUM_CONDITION.FAIR,
  RADAR_MINIMUM_CONDITION.POOR,
] as const;

type RadarReleaseDraft = {
  priority: RadarPriority;
  targetPrice: string;
  minimumCondition: RadarMinimumCondition | '';
  note: string;
  hidden: boolean;
  resolved: boolean;
};

type RadarSaveHandler = (id: number, payload: RadarLocalDecisionPayload) => Promise<void>;

function createEmptyRadarResponse(): RadarResponse {
  return normalizeRadarResponse({});
}

function createReleaseDraft(item: RadarRelease): RadarReleaseDraft {
  return {
    priority: item.local.priority,
    targetPrice: item.local.target_price == null ? '' : item.local.target_price.toFixed(2),
    minimumCondition: item.local.minimum_condition ?? '',
    note: item.local.note,
    hidden: item.local.hidden,
    resolved: item.local.resolved,
  };
}

function createReleasePayload(draft: RadarReleaseDraft): RadarLocalDecisionPayload {
  return {
    local: {
      priority: draft.priority,
      target_price: draft.targetPrice.trim() ? Number(draft.targetPrice) : null,
      minimum_condition: draft.minimumCondition || null,
      note: draft.note,
      hidden: draft.hidden,
      resolved: draft.resolved,
    },
  };
}

type RadarReleaseCardProps = {
  item: RadarRelease;
  t: Translate;
  onSave: RadarSaveHandler;
};

function RadarReleaseCard({
  item,
  t,
  onSave,
}: RadarReleaseCardProps) {
  const [draft, setDraft] = useState(() => createReleaseDraft(item));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setDraft(createReleaseDraft(item));
    setSaveFailed(false);
  }, [item]);

  const displayCurrency = item.display_currency || 'EUR';
  const releaseKey = item.id ?? item.release_id ?? 0;

  async function handleSave() {
    if (item.id == null) {
      return;
    }

    setSaving(true);
    setSaveFailed(false);

    try {
      await onSave(item.id, createReleasePayload(draft));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-3xl border border-white/10 bg-slate-950/30 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="font-display text-2xl text-white">
            {item.artist} - {item.title}
          </p>
          <p className="text-sm text-slate-300">
            #{item.release_id} · {item.marketplace.status}
          </p>
        </div>
        <a
          href={`https://www.discogs.com/release/${item.release_id}`}
          target="_blank"
          rel="noreferrer"
          data-radar-discogs={String(releaseKey)}
          className="inline-flex items-center justify-center rounded-full border border-brand-200/40 px-4 py-2 text-sm text-brand-100 no-underline transition hover:border-brand-100 hover:text-white"
        >
          {t('radar.openDiscogs')}
        </a>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.priority')}</span>
          <select
            name={`radar-priority-${releaseKey}`}
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as RadarPriority }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          >
            {RADAR_PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {t(`radar.priority.${priority}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.targetPrice')} ({displayCurrency})</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            name={`radar-target-price-${releaseKey}`}
            value={draft.targetPrice}
            onInput={(event) => {
              const target = event.target as HTMLInputElement;
              setDraft((current) => ({ ...current, targetPrice: target.value }));
            }}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          />
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.minimumCondition')}</span>
          <select
            name={`radar-minimum-condition-${releaseKey}`}
            value={draft.minimumCondition}
            onChange={(event) => setDraft((current) => ({
              ...current,
              minimumCondition: event.target.value as RadarMinimumCondition | '',
            }))}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          >
            <option value="">{t('radar.minimumCondition.none')}</option>
            {RADAR_MINIMUM_CONDITION_OPTIONS.map((condition) => (
              <option key={condition} value={condition}>
                {t(`radar.minimumCondition.${condition}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400">{t('radar.minimumCondition.info')}</p>
        </label>

        <label className="space-y-2 text-sm text-slate-200">
          <span>{t('radar.note')}</span>
          <textarea
            name={`radar-note-${releaseKey}`}
            value={draft.note}
            onInput={(event) => {
              const target = event.target as HTMLTextAreaElement;
              setDraft((current) => ({ ...current, note: target.value }));
            }}
            rows={4}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-200">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name={`radar-hidden-${releaseKey}`}
            checked={draft.hidden}
            onChange={(event) => setDraft((current) => ({ ...current, hidden: event.target.checked }))}
          />
          <span>{t('radar.hidden')}</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name={`radar-resolved-${releaseKey}`}
            checked={draft.resolved}
            onChange={(event) => setDraft((current) => ({ ...current, resolved: event.target.checked }))}
          />
          <span>{t('radar.resolved')}</span>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          data-radar-save={String(releaseKey)}
          onClick={() => void handleSave()}
          disabled={saving}
          className="primary-button inline-flex items-center justify-center disabled:opacity-60"
        >
          {saving ? t('radar.saving') : t('radar.save')}
        </button>
        {saveFailed ? <p className="text-sm text-rose-200">{t('radar.saveFailed')}</p> : null}
      </div>
    </li>
  );
}

function renderRadarContent(
  radar: RadarResponse,
  loading: boolean,
  loadFailed: boolean,
  t: Translate,
  onSave: RadarSaveHandler,
) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/30 p-8 text-center text-slate-300">
        {t('radar.loading')}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-950/20 p-8 text-center text-rose-100">
        {t('radar.loadFailed')}
      </div>
    );
  }

  if (radar.items.length === 0) {
    return (
      <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-slate-950/20 p-8">
        <h2 className="font-display text-4xl text-white">{t('radar.emptyTitle')}</h2>
        <p className="max-w-2xl text-base text-slate-300">{t('radar.emptyBody')}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {radar.items.map((item) => (
        <RadarReleaseCard key={item.id ?? item.release_id} item={item} t={t} onSave={onSave} />
      ))}
    </ul>
  );
}

function Radar() {
  const { accountUnavailable, capabilities } = useAuth();
  const { t } = useI18n();
  const [radar, setRadar] = useState(createEmptyRadarResponse);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (accountUnavailable || !capabilities.canUseRadar) {
      setRadar(createEmptyRadarResponse());
      setLoading(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadFailed(false);

    api.getRadar()
      .then((nextRadar) => {
        if (cancelled) {
          return;
        }

        setRadar(nextRadar);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoadFailed(true);
        setRadar(createEmptyRadarResponse());
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountUnavailable, capabilities.canUseRadar]);

  async function saveRadarRelease(id: number, payload: RadarLocalDecisionPayload) {
    const nextRadar = await api.updateRadarRelease(id, payload);
    setRadar(nextRadar);
  }

  if (accountUnavailable) {
    return <div className="glass-panel p-8 text-center text-amber-100">{t('radar.accountUnavailable')}</div>;
  }

  if (!capabilities.canUseRadar) {
    return (
      <section className="glass-panel mx-auto max-w-3xl space-y-5 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
        <div className="space-y-3">
          <h2 className="font-display text-4xl text-white">{t('radar.blockedTitle')}</h2>
          <p className="text-base text-slate-300">{t('radar.blockedBody')}</p>
        </div>
        <div>
          <Link to="/settings" className="primary-button inline-flex items-center justify-center no-underline">
            {t('radar.openSettings')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel mx-auto max-w-5xl space-y-6 p-8">
      <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('radar.eyebrow')}</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
        {RADAR_SUMMARY_CARDS.map(({ labelKey, valueKey }) => (
          <article key={labelKey} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t(labelKey)}</p>
            <p className="mt-3 font-display text-3xl text-white">{radar.summary[valueKey]}</p>
          </article>
        ))}
      </div>

      {renderRadarContent(radar, loading, loadFailed, t, saveRadarRelease)}
    </section>
  );
}

export default Radar;
