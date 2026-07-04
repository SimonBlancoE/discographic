import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import type { CollectionRelease } from '../../shared/contracts/release.js';

export default function PrintCatalog() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [releases, setReleases] = useState<CollectionRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideAttribution, setHideAttribution] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        // Load all items matching current filters (using high limit for catalog printing)
        const params: Record<string, any> = {};
        searchParams.forEach((value, key) => {
          params[key] = value;
        });
        const response = await api.getCollection({
          ...params,
          page: 1,
          limit: 1000, // Load a large batch for catalog printing
        });
        setReleases(response.releases);
      } catch (error) {
        console.error('Failed to load printable catalog:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [searchParams]);

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
        <div className="text-lg font-medium">Cargando catálogo para impresión...</div>
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
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {t('collection.hideAttribution') || 'Ocultar mención al repositorio'}
        </label>
        <div className="h-4 w-px bg-slate-200" />
        <button
          onClick={() => window.print()}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          {t('collection.print') || 'Imprimir'}
        </button>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          {t('collection.backToCollection') || 'Volver'}
        </button>
      </div>

      {/* Printable Catalog Page Header */}
      <header className="mb-6 flex items-baseline justify-between border-b border-slate-300 pb-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">
            {t('collection.catalogTitle') || 'Catálogo de Colección'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Total: {releases.length} vinilos | {currentDate}
          </p>
        </div>
      </header>

      {/* Catalog Items - Printable Grid/Table */}
      <div className="divide-y divide-slate-200">
        {releases.map((release) => {
          const coverUrl = release.id ? `/api/media/cover/${release.id}?variant=wall` : release.cover_url;
          return (
            <div
              key={release.id}
              className="flex items-center py-2 gap-4 break-inside-avoid print:break-inside-avoid"
            >
              <div className="h-12 w-12 flex-shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg">💿</div>
                )}
              </div>
              <div className="flex-grow min-w-0">
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
                    {release.labels.map((l: any) => l.name || l).join(', ') || '-'}
                  </span>
                  {release.formats.length > 0 && (
                    <span className="text-slate-500">
                      • {release.formats.map((f: any) => f.name || f).join(', ')}
                    </span>
                  )}
                  {release.country && (
                    <span className="text-slate-500">• {release.country}</span>
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
          Generado con Discographic (github.com/SimonBlancoE/discographic)
        </footer>
      )}
    </div>
  );
}
