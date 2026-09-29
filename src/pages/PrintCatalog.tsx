import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { joinNames } from '../lib/format';
import type { CollectionRelease } from '../../shared/contracts/release.js';
import { conditionShortLabel } from '../../shared/contracts/collectionFields.js';
import CoverImage from '../components/CoverImage';

// The collection endpoint caps page size at 100, so the catalog walks every page.
const PRINT_PAGE_SIZE = 100;

export default function PrintCatalog() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [releases, setReleases] = useState<CollectionRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideAttribution, setHideAttribution] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        setLoading(true);
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          params[key] = value;
        });

        const collected: CollectionRelease[] = [];
        let totalPages = 1;
        for (let page = 1; page <= totalPages && !cancelled; page += 1) {
          const response = await api.getCollection({ ...params, page, limit: PRINT_PAGE_SIZE });
          collected.push(...response.releases);
          totalPages = response.pagination.totalPages || 1;
        }

        if (!cancelled) {
          setReleases(collected);
        }
      } catch (error) {
        console.error('Failed to load printable catalog:', error);
        if (!cancelled) {
          toast.error(t('collection.loadError', { error: getErrorMessage(error, t('client.networkError')) }));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [searchParams, t, toast]);

  // Auto print when loading completes and images are ready
  useEffect(() => {
    if (!loading && releases.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, releases]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-slate-800">
        <div className="text-lg font-medium">{t('collection.catalogLoading')}</div>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString();

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 font-sans print:p-0">
      {/* Floating Control Panel - Hidden in Print */}
      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-slate-200 bg-white/95 px-6 py-3 shadow-xl backdrop-blur-md print:hidden">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            checked={hideAttribution}
            onChange={(e) => setHideAttribution(e.target.checked)}
            className="h-4 w-4 rounded-sm border-slate-300 text-brand-500 focus:ring-brand-500"
          />
          {t('collection.hideAttribution')}
        </label>
        <div className="h-4 w-px bg-slate-200" />
        <button
          onClick={() => window.print()}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          {t('collection.print')}
        </button>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          {t('collection.backToCollection')}
        </button>
      </div>

      {/* Printable Catalog Page Header */}
      <header className="mb-6 flex items-baseline justify-between border-b border-slate-300 pb-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">
            {t('collection.catalogTitle')}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t('collection.catalogTotal', { count: releases.length, date: currentDate })}
          </p>
        </div>
      </header>

      {/* Catalog Items - Printable Grid/Table */}
      <div className="divide-y divide-slate-200">
        {releases.map((release) => {
          const coverUrl = release.id && release.cover_url ? `/api/media/cover/${release.id}?variant=wall` : null;
          return (
            <div
              key={release.id}
              className="flex items-center py-2 gap-4 break-inside-avoid print:break-inside-avoid"
            >
              <div className="h-12 w-12 shrink-0 bg-slate-100 rounded-sm border border-slate-200 overflow-hidden">
                <CoverImage src={coverUrl} fallbackSrc={release.cover_url} alt="" className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
              </div>
              <div className="grow min-w-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold text-sm text-slate-900 truncate">
                    {release.artist} - {release.title}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono whitespace-nowrap ml-2">
                    {release.year || '-'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
                  <span className="truncate max-w-xs">
                    {joinNames(release.labels)}
                  </span>
                  {release.formats.length > 0 && (
                    <span className="text-slate-500">
                      • {joinNames(release.formats)}
                    </span>
                  )}
                  {release.country && (
                    <span className="text-slate-500">• {release.country}</span>
                  )}
                  {release.media_condition && (
                    <span className="text-slate-500">• {conditionShortLabel(release.media_condition)}{release.sleeve_condition ? `/${conditionShortLabel(release.sleeve_condition)}` : ''}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* GitHub Repository Attribution Footer */}
      {!hideAttribution && (
        <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400 font-mono">
          {t('collection.catalogFooter')}
        </footer>
      )}
    </div>
  );
}
