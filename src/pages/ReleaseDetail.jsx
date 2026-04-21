import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ReleaseDetailSkeleton } from '../components/LoadingSkeletons';
import StarRating from '../components/StarRating';
import { downloadNodeAsPng, shareNodeAsPng } from '../lib/exportImage';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency, formatDate, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

function MetaItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-100">{value || '-'}</p>
    </div>
  );
}

function ReleaseDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { currency } = useAuth();
  const toast = useToast();
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const payload = await api.getRelease(id);
        setRelease(payload);
      } catch (error) {
        toast.error(t('release.loadError', { error: error.message }));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  async function updateRelease(patch) {
    const previous = release;
    const nextPatch = patch.notes === undefined
      ? patch
      : { ...patch, notes: String(patch.notes || '').trim() };
    const optimistic = { ...release, ...nextPatch };
    if (nextPatch.notes !== undefined) {
      optimistic.notes_text = nextPatch.notes;
      optimistic.notes = nextPatch.notes ? [{ field_id: null, value: nextPatch.notes }] : [];
    }
    setRelease(optimistic);

    try {
      const updated = await api.updateRelease(id, nextPatch);
      setRelease(updated);
    } catch (error) {
      setRelease(previous);
      toast.error(t('release.saveError', { error: error.message }));
    }
  }

  async function handleShare(mode) {
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
      toast.error(t('release.exportError', { error: error.message }));
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return <ReleaseDetailSkeleton />;
  }

  if (!release) {
    return <div className="glass-panel p-10 text-center text-slate-300">{t('release.notFound')}</div>;
  }

  return (
    <div className="space-y-6">
      <Link to="/collection" className="inline-flex items-center gap-2 text-sm text-brand-200 transition hover:text-brand-100">
        {t('release.back')}
      </Link>

      <div ref={shareCardRef} className="space-y-6 rounded-[34px] bg-slate-950/35 p-1">
      <section className="glass-panel grid gap-6 p-6 xl:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80">
          {release.detail_cover_url || release.cover_url ? (
            <img src={release.detail_cover_url || release.cover_url} alt={release.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-6xl">💿</div>
          )}
        </div>

        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('release.eyebrow')}</p>
          <h2 className="mt-2 font-display text-4xl text-white">{release.title}</h2>
          <p className="mt-3 text-xl text-slate-300">{release.artist}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div>
               <p className="mb-2 text-sm text-slate-400">{t('release.rating')}</p>
              <StarRating value={release.rating} onChange={(rating) => updateRelease({ rating })} />
            </div>
            <div>
               <p className="mb-2 text-sm text-slate-400">{t('release.marketplacePrice')}</p>
              <p className="text-2xl text-brand-100">{release.estimated_value ? formatCurrency(release.estimated_value, currency) : '-'}</p>
            </div>
          </div>

          <label className="mt-6 block">
             <span className="mb-2 block text-sm text-slate-400">{t('release.notes')}</span>
            <textarea
              defaultValue={release.notes_text || ''}
              onBlur={(event) => updateRelease({ notes: event.target.value })}
              rows={4}
              className="w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-300"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
         <MetaItem label={t('collection.year')} value={release.year || '-'} />
         <MetaItem label={t('dashboard.genres')} value={joinNames(release.genres)} />
         <MetaItem label={t('dashboard.styles')} value={joinNames(release.styles)} />
         <MetaItem label={t('dashboard.formats')} value={joinNames(release.formats)} />
         <MetaItem label={t('dashboard.labels')} value={joinNames(release.labels)} />
         <MetaItem label={t('release.country')} value={release.country} />
         <MetaItem label={t('release.createdAt')} value={formatDate(release.date_added)} />
         <MetaItem label={t('release.lastSync')} value={formatDate(release.synced_at)} />
      </section>
      </div>

      <section className="glass-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="font-display text-xl text-white">{t('release.shareTitle')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('release.shareBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleShare('download')} disabled={sharing} className="secondary-button disabled:opacity-60">
            {sharing ? t('release.preparing') : t('release.downloadPng')}
          </button>
          <button type="button" onClick={() => handleShare('share')} disabled={sharing} className="primary-button disabled:opacity-60">
            {t('release.share')}
          </button>
        </div>
      </section>

      <section className="glass-panel p-5">
         <h3 className="font-display text-2xl text-slate-50">{t('release.tracklist')}</h3>
        <div className="mt-4 overflow-hidden rounded-3xl border border-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                 <th className="px-4 py-3">{t('release.position')}</th>
                 <th className="px-4 py-3">{t('release.track')}</th>
                 <th className="px-4 py-3">{t('release.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {(release.tracklist || []).map((track, index) => (
                <tr key={`${track.position}-${track.title}-${index}`} className="border-t border-white/5 text-slate-200">
                  <td className="px-4 py-3">{track.position || '-'}</td>
                  <td className="px-4 py-3">{track.title || '-'}</td>
                  <td className="px-4 py-3">{track.duration || '-'}</td>
                </tr>
              ))}
              {!release.tracklist?.length && (
                <tr>
                   <td className="px-4 py-4 text-slate-400" colSpan="3">{t('release.noTracklist')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <a
        href={`https://www.discogs.com/release/${release.release_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="primary-button flex items-center justify-center gap-3 py-5 text-lg"
      >
        {t('release.viewDiscogs')}
      </a>
    </div>
  );
}

export default ReleaseDetail;
