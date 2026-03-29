import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FilterPanel from './FilterPanel';
import { downloadNodeAsJpeg } from '../lib/exportImage';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

const DEFAULT_FILTERS = {
  search: '',
  genre: '',
  style: '',
  decade: '',
  format: '',
  label: ''
};

const EXPORT_SIZE = 86;
const QUALITY_PRESETS = {
  rapido: { label: 'Rapido', quality: 0.82, pixelRatio: 1.1 },
  equilibrado: { label: 'Equilibrado', quality: 0.9, pixelRatio: 1.5 },
  alta: { label: 'Alta calidad', quality: 0.96, pixelRatio: 1.9 }
};

function CoverWall({ releases, filters: availableFilters }) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const [size, setSize] = useState(110);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showTitles, setShowTitles] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportQuality, setExportQuality] = useState('equilibrado');
  const [exportStage, setExportStage] = useState('');
  const [tapeteGenerating, setTapeteGenerating] = useState(false);
  const posterRef = useRef(null);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return releases.filter((release) => {
      if (query && !`${release.artist} ${release.title}`.toLowerCase().includes(query)) {
        return false;
      }

      if (filters.genre && !(release.genres || []).includes(filters.genre)) {
        return false;
      }

      if (filters.style && !(release.styles || []).includes(filters.style)) {
        return false;
      }

      if (filters.decade) {
        const start = Number(filters.decade);
        if (!Number.isFinite(start) || !(release.year >= start && release.year < start + 10)) {
          return false;
        }
      }

      if (filters.format) {
        const formats = (release.formats || []).map((format) => format?.name || format);
        if (!formats.includes(filters.format)) {
          return false;
        }
      }

      if (filters.label) {
        const labels = (release.labels || []).map((label) => label?.name || label);
        if (!labels.includes(filters.label)) {
          return false;
        }
      }

      return true;
    });
  }, [releases, filters]);

  const exportReleases = filtered;

  async function handleExport() {
    if (!posterRef.current) {
      return;
    }

    if (!filtered.length) {
      toast.info(t('wall.noCovers'));
      return;
    }

    setExporting(true);
    setExportStage(t('wall.preparingThumbs'));
    try {
      const preset = QUALITY_PRESETS[exportQuality];
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      setExportStage(t('wall.makingPoster'));
      await downloadNodeAsJpeg(posterRef.current, `discographic-wall-${new Date().toISOString().slice(0, 10)}.jpg`, { quality: preset.quality, pixelRatio: preset.pixelRatio });
      setExportStage(t('wall.downloadingFile'));
      toast.success(t('wall.posterDownloaded'));
    } catch (error) {
      toast.error(t('wall.posterError', { error: error.message }));
    } finally {
      setExporting(false);
      setExportStage('');
    }
  }

  async function handleTapete() {
    setTapeteGenerating(true);
    try {
      const activeFilters = {};
      for (const [key, value] of Object.entries(filters)) {
        if (value) activeFilters[key] = value;
      }
      const blob = await api.fetchTapeteBlob(7200, activeFilters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `discographic-mat-${new Date().toISOString().slice(0, 10)}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t('wall.tapeteDownloaded'));
    } catch (error) {
      toast.error(t('wall.tapeteError', { error: error.message }));
    } finally {
      setTapeteGenerating(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-5">
      <section className="glass-panel flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('wall.eyebrow')}</p>
          <h2 className="mt-2 font-display text-4xl text-white">{t('wall.title')}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{t('wall.subtitle')}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <span>{t('wall.size')}</span>
            <input type="range" min="84" max="160" value={size} onChange={(event) => setSize(Number(event.target.value))} />
          </label>
          <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <input type="checkbox" checked={showTitles} onChange={(event) => setShowTitles(event.target.checked)} />
            <span>{t('wall.showTitles')}</span>
          </label>
          <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <span>{t('wall.quality')}</span>
            <select value={exportQuality} onChange={(event) => setExportQuality(event.target.value)} className="bg-transparent outline-none">
              {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
                <option key={key} value={key} className="bg-slate-950 text-slate-100">{preset.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleExport} disabled={exporting} className="primary-button disabled:opacity-60">
             {exporting ? t('wall.exporting') : t('wall.exportJpg')}
           </button>
          <button type="button" onClick={handleTapete} disabled={tapeteGenerating} className="primary-button bg-gradient-to-r from-amber-500 to-brand-400 disabled:opacity-60">
            {tapeteGenerating ? t('wall.generating') : t('wall.seamless')}
          </button>
        </div>
      </section>

      <div className="glass-panel flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm text-slate-300">{t('wall.info')}</p>
        </div>
      </div>

      {exporting && exportStage ? (
        <div className="glass-panel flex items-center justify-between gap-3 p-4 text-sm text-slate-300">
          <span>{exportStage}</span>
          <span className="text-slate-500">Modo {QUALITY_PRESETS[exportQuality].label.toLowerCase()}</span>
        </div>
      ) : null}

      <div className="glass-panel p-4">
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <span>{t('wall.search')}</span>
          <input value={filters.search} onChange={(event) => handleFilterChange('search', event.target.value)} placeholder={t('wall.searchArtistTitle')} className="w-full bg-transparent outline-none placeholder:text-slate-500" />
        </label>
      </div>

      <FilterPanel filters={filters} options={availableFilters} onChange={handleFilterChange} onReset={() => setFilters(DEFAULT_FILTERS)} />

      <section className="glass-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>{t('wall.visibleCovers', { count: formatNumber(filtered.length) })}</span>
          <span>
            {t('wall.cacheInfo')}
          </span>
        </div>

        <div className="cover-wall-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
          {filtered.map((release) => (
            <Link key={release.id} to={`/release/${release.id}`} className="cover-wall-card group">
              <div className="overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/70 shadow-[0_18px_40px_rgba(2,6,23,0.32)]">
                <div className="aspect-square overflow-hidden bg-slate-900/80">
                  {release.wall_cover_url || release.cover_url ? (
                    <img src={release.wall_cover_url || release.cover_url} alt={release.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">💿</div>
                  )}
                </div>
                {showTitles ? (
                  <div className="space-y-1 px-3 py-3">
                    <p className="truncate text-sm font-medium text-slate-100">{release.title}</p>
                    <p className="truncate text-xs text-slate-400">{release.artist}</p>
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="pointer-events-none fixed left-[-100000px] top-0 opacity-0">
        <section ref={posterRef} className="glass-panel p-5" style={{ width: '1280px' }}>
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-slate-400">
            <span>{t('wall.posterLabel')}</span>
            <span>{t('wall.coverCount', { count: formatNumber(exportReleases.length) })}</span>
          </div>

          <div className="cover-wall-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${EXPORT_SIZE}px, 1fr))` }}>
            {exportReleases.map((release) => (
              <div key={release.id} className="overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/70">
                <div className="aspect-square overflow-hidden bg-slate-900/80">
                  {release.poster_cover_url || release.wall_cover_url || release.cover_url ? (
                    <img src={release.poster_cover_url || release.wall_cover_url || release.cover_url} alt={release.title} className="h-full w-full object-cover" loading="eager" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">💿</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {tapeteGenerating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel mx-4 max-w-lg space-y-5 p-8 text-center">
            <div className="mx-auto h-20 w-20 animate-spin rounded-full border-4 border-white/10 border-t-brand-400" />
            <div>
               <h3 className="font-display text-2xl text-white">{t('wall.generatingTitle')}</h3>
               <p className="mt-3 text-sm text-slate-300">
                 {t('wall.generatingBody')}
               </p>
               <p className="mt-3 text-sm text-slate-400">
                 {t('wall.generatingHelp')}
               </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CoverWall;
