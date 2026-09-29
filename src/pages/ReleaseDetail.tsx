import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { ReleaseDetail as ReleaseDetailContract } from '../../shared/contracts/release.js';
import { ReleaseDetailSkeleton } from '../components/LoadingSkeletons';
import StarRating from '../components/StarRating';
import CoverImage from '../components/CoverImage';
import Icon from '../components/Icon';
import OtherPressings from '../components/OtherPressings';
import PriceSuggestions from '../components/PriceSuggestions';
import { downloadNodeAsPng, shareNodeAsPng } from '../lib/exportImage';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { formatCompactNumber, formatCurrency, formatDate, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import { applyOptimisticReleasePatch } from '../lib/releaseEdits';
import { shouldShowReleaseListingPrice } from '../lib/releaseDetailPricing';
import type { CollectionMeta, ReleaseTrackRow, UpdateReleasePatch } from '../lib/types';

function MetaItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/3 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm text-slate-100">{value || '-'}</p>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/5 bg-black/20 px-3 py-3" title={hint}>
      <p className="text-[11px] uppercase leading-tight tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-display text-xl tabular-nums text-white">{value}</p>
    </div>
  );
}

function ConditionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const choices = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <label className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-400">
      {label}
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="field-input normal-case tracking-normal">
        <option value="" className="bg-slate-950">{t('condition.ungraded')}</option>
        {choices.map((option) => (
          <option key={option} value={option} className="bg-slate-950">{option}</option>
        ))}
      </select>
    </label>
  );
}

function ReleaseDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { currency } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [release, setRelease] = useState<ReleaseDetailContract | null>(null);
  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset so an edit can never target the new id with the previous release's data.
    setRelease(null);
    setLoading(true);

    api.getRelease(id ?? '')
      .then((payload) => {
        if (!cancelled) {
          setRelease(payload);
          setNotesDraft(payload.notes_text || '');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(t('release.loadError', { error: getErrorMessage(error, t('client.networkError')) }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    api.getCollectionMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  async function updateRelease(patch: UpdateReleasePatch) {
    if (!release) {
      return;
    }

    const previous = release;
    const { nextPatch, nextRelease } = applyOptimisticReleasePatch(release, patch);
    setRelease(nextRelease);

    try {
      const updated = await api.updateRelease(release.id ?? '', nextPatch);
      setRelease((current) => (current?.id === updated.id ? updated : current));
      toast.success(t('release.saved'));
    } catch (error) {
      // Part of a multi-field edit may already be saved, so show the server's state rather than guessing.
      const restored = await api.getRelease(previous.id ?? '').catch(() => previous);
      setRelease((current) => (current?.id === restored.id ? restored : current));
      if (patch.notes !== undefined) {
        setNotesDraft(restored.notes_text || '');
      }
      toast.error(t('release.saveError', { error: getErrorMessage(error, t('client.networkError')) }));
    }
  }

  async function handleShare(mode: 'download' | 'share') {
    if (!shareCardRef.current || !release) {
      return;
    }

    setSharing(true);
    try {
      if (mode === 'share') {
        const result = await shareNodeAsPng(shareCardRef.current, `discographic-${release.release_id}.png`, `${release.artist} - ${release.title}`);
        if (result === 'downloaded') {
          toast.info(t('release.sharedDownloaded'));
        } else {
          toast.success(t('release.sharedSuccess'));
        }
      } else {
        await downloadNodeAsPng(shareCardRef.current, `discographic-${release.release_id}.png`);
        toast.success(t('release.downloadSuccess'));
      }
    } catch (error) {
      toast.error(t('release.exportError', { error: getErrorMessage(error, t('client.networkError')) }));
    } finally {
      setSharing(false);
    }
  }

  function goBack() {
    // Return to the exact collection page/filters when we came from inside the app.
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/collection');
    }
  }

  if (loading) {
    return <ReleaseDetailSkeleton />;
  }

  if (!release) {
    return <div className="glass-panel p-10 text-center text-slate-300">{t('release.notFound')}</div>;
  }

  const tracklist = (release.tracklist as ReleaseTrackRow[]) || [];
  const showListingPrice = shouldShowReleaseListingPrice(release);
  const coverSrc = release.cover_url ? release.detail_cover_url : null;
  const folders = meta?.folders ?? [];
  const currentFolder = folders.find((folder) => folder.id === release.folder_id);
  const hasCommunity = release.community_have != null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={goBack} className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
        <Icon name="arrowLeft" size={16} />
        {t('release.back')}
      </button>

      <div ref={shareCardRef} className="space-y-6 rounded-2xl">
        <section className="glass-panel relative overflow-hidden">
          {coverSrc ? <div className="detail-backdrop" style={{ backgroundImage: `url(${coverSrc})` }} aria-hidden="true" /> : null}
          <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[300px_1fr]">
            <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
              <CoverImage src={coverSrc} fallbackSrc={release.cover_url} alt={release.title} className="aspect-square h-full w-full object-cover" placeholderClassName="aspect-square w-full" />
            </div>

            <div className="@container min-w-0">
              <p className="page-eyebrow">{t('release.eyebrow')}</p>
              <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">{release.title}</h2>
              <p className="mt-2 text-lg text-slate-300">{release.artist}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {release.year ? <span className="pill-tag">{release.year}</span> : null}
                {release.country ? <span className="pill-tag">{release.country}</span> : null}
                {release.formats.length ? <span className="pill-tag">{joinNames(release.formats)}</span> : null}
                {currentFolder ? <span className="pill-tag"><Icon name="folder" size={12} />{currentFolder.name}</span> : null}
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-6">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">{t('release.rating')}</p>
                  <StarRating value={release.rating} onChange={(rating) => updateRelease({ rating })} />
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">{t('release.marketplacePrice')}</p>
                  <p className="font-display text-2xl text-brand-100">{release.estimated_value ? formatCurrency(release.estimated_value, currency) : '-'}</p>
                </div>
                {showListingPrice ? (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">{t('collection.listingPrice')}</p>
                    <p className="font-display text-2xl text-brand-100">{formatCurrency(release.listing_price, currency)}</p>
                  </div>
                ) : null}
              </div>

              {hasCommunity ? (
                <div className="mt-6 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
                  <StatTile label={t('release.communityHave')} value={formatCompactNumber(release.community_have)} />
                  <StatTile label={t('release.communityWant')} value={formatCompactNumber(release.community_want)} />
                  <StatTile
                    label={t('release.communityRating')}
                    value={release.community_rating ? `${release.community_rating.toFixed(2)} ★` : '-'}
                    hint={t('release.communityRatingCount', { count: release.community_rating_count ?? 0 })}
                  />
                  <StatTile label={t('release.forSale')} value={release.num_for_sale == null ? '-' : formatCompactNumber(release.num_for_sale)} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetaItem label={t('dashboard.genres')} value={joinNames(release.genres)} />
          <MetaItem label={t('dashboard.styles')} value={joinNames(release.styles)} />
          <MetaItem label={t('dashboard.labels')} value={joinNames(release.labels)} />
          <MetaItem label={t('release.createdAt')} value={formatDate(release.date_added)} />
        </section>
      </div>

      <section className="glass-panel grid gap-5 p-5 lg:grid-cols-[1fr_1.4fr]" aria-labelledby="copy-title">
        <div className="space-y-4">
          <div>
            <h3 id="copy-title" className="font-display text-xl text-white">{t('release.yourCopy')}</h3>
            <p className="mt-1 text-sm text-slate-400">{t('release.yourCopyHint')}</p>
          </div>
          {meta?.mediaConditions.length ? (
            <ConditionSelect
              label={t('condition.media')}
              value={release.media_condition}
              options={meta.mediaConditions}
              onChange={(value) => updateRelease({ media_condition: value })}
            />
          ) : null}
          {meta?.sleeveConditions.length ? (
            <ConditionSelect
              label={t('condition.sleeve')}
              value={release.sleeve_condition}
              options={meta.sleeveConditions}
              onChange={(value) => updateRelease({ sleeve_condition: value })}
            />
          ) : null}
          {folders.length ? (
            <label className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-400">
              {t('collection.folder')}
              <select
                value={release.folder_id}
                onChange={(event) => updateRelease({ folder_id: Number(event.target.value) })}
                className="field-input normal-case tracking-normal"
              >
                {!currentFolder ? <option value={release.folder_id} className="bg-slate-950">#{release.folder_id}</option> : null}
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id} className="bg-slate-950">{folder.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {release.id != null ? <PriceSuggestions releaseId={release.id} mediaCondition={release.media_condition} /> : null}
        </div>
        <label className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-400">
          {t('release.notes')}
          <textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            onBlur={() => {
              if (notesDraft.trim() !== (release.notes_text || '').trim()) {
                updateRelease({ notes: notesDraft });
              }
            }}
            rows={7}
            placeholder={t('collection.notePlaceholder')}
            className="field-input h-full min-h-[160px] normal-case tracking-normal"
          />
        </label>
      </section>

      <section className="glass-panel p-5">
        <h3 className="font-display text-xl text-slate-50">{t('release.tracklist')}</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/3 text-xs uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th scope="col" className="w-20 px-4 py-3 font-medium">{t('release.position')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('release.track')}</th>
                <th scope="col" className="w-24 px-4 py-3 text-right font-medium">{t('release.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {tracklist.map((track, index) => (
                <tr key={`${track.position}-${track.title}-${index}`} className="border-t border-white/5 text-slate-200">
                  <td className="px-4 py-2.5 text-slate-500">{track.position || '-'}</td>
                  <td className="px-4 py-2.5">{track.title || '-'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{track.duration || '-'}</td>
                </tr>
              ))}
              {!tracklist.length && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={3}>{t('release.noTracklist')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {release.id != null ? <OtherPressings releaseId={release.id} discogsReleaseId={release.release_id} /> : null}

      <section className="glass-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="font-display text-xl text-white">{t('release.shareTitle')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('release.shareBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleShare('download')} disabled={sharing} className="secondary-button disabled:opacity-60">
            <Icon name="download" size={16} />
            {sharing ? t('release.preparing') : t('release.downloadPng')}
          </button>
          <button type="button" onClick={() => handleShare('share')} disabled={sharing} className="secondary-button disabled:opacity-60">
            <Icon name="share" size={16} />
            {t('release.share')}
          </button>
          <a
            href={`https://www.discogs.com/release/${release.release_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="primary-button"
          >
            {t('release.viewDiscogs')}
            <Icon name="external" size={16} />
          </a>
        </div>
      </section>
    </div>
  );
}

export default ReleaseDetail;
