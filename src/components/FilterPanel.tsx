import { useI18n } from '../lib/I18nContext';
import { UNGRADED_CONDITION, type CollectionFilters } from '../../shared/collectionFilters.js';
import type { CollectionFilterOptions, FilterKey } from '../lib/types';

type FilterItem = {
  key: FilterKey;
  label: string;
  options: Array<{ value: string; label: string }>;
};

function toOptions(values: Array<string | number>, format: (value: string) => string = (value) => value) {
  return values.map((value) => ({ value: String(value), label: format(String(value)) }));
}

function FilterPanel({
  filters,
  options,
  onChange,
  onReset,
}: {
  filters: CollectionFilters;
  options: CollectionFilterOptions;
  onChange: (key: FilterKey, value: string) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();

  const items: FilterItem[] = [
    { key: 'genre', label: t('collection.genre'), options: toOptions(options.genres || []) },
    { key: 'style', label: t('collection.style'), options: toOptions(options.styles || []) },
    { key: 'decade', label: t('collection.decade'), options: toOptions(options.decades || [], (value) => `${value}s`) },
    { key: 'format', label: t('collection.format'), options: toOptions(options.formats || []) },
    { key: 'label', label: t('collection.label'), options: toOptions(options.labels || []) },
  ];

  if (options.folders?.length) {
    items.push({
      key: 'folder',
      label: t('collection.folder'),
      options: options.folders.map((folder) => ({ value: String(folder.id), label: `${folder.name} (${folder.count})` })),
    });
  }

  if (options.conditions) {
    items.push({
      key: 'condition',
      label: t('collection.condition'),
      options: [
        ...toOptions(options.conditions),
        { value: UNGRADED_CONDITION, label: t('condition.ungraded') },
      ],
    });
  }

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <label key={item.key} className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-400">
            <span>{item.label}</span>
            <select
              value={filters[item.key] || ''}
              onChange={(event) => onChange(item.key, event.target.value)}
              className={`field-input normal-case tracking-normal ${filters[item.key] ? 'border-brand-300/50' : ''}`}
            >
              <option value="" className="bg-slate-950">{t('collection.all')}</option>
              {item.options.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-950">
                  {option.label}
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
