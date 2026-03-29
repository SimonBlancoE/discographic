import { useI18n } from '../lib/I18nContext';

function FilterPanel({ filters, options, onChange, onReset }) {
  const { t } = useI18n();

  const items = [
    { key: 'genre', label: t('collection.genre'), values: options.genres || [] },
    { key: 'style', label: t('collection.style'), values: options.styles || [] },
    { key: 'decade', label: t('collection.decade'), values: options.decades || [] },
    { key: 'format', label: t('collection.format'), values: options.formats || [] },
    { key: 'label', label: t('collection.label'), values: options.labels || [] }
  ];

  return (
    <div className="glass-panel flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg text-slate-100">{t('collection.filtersTitle')}</h3>
          <p className="text-sm text-slate-400">{t('collection.filtersSubtitle')}</p>
        </div>
        <button type="button" onClick={onReset} className="text-sm text-brand-200 transition hover:text-brand-100">
          {t('collection.clearFilters')}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <label key={item.key} className="flex flex-col gap-2 text-sm text-slate-300">
            <span>{item.label}</span>
            <select
              value={filters[item.key] || ''}
              onChange={(event) => onChange(item.key, event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-300"
            >
              <option value="">{t('collection.all')}</option>
              {item.values.map((value) => (
                <option key={value} value={value}>
                  {item.key === 'decade' ? `${value}s` : value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

export default FilterPanel;
