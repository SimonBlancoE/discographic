import { useI18n } from '../lib/I18nContext';
import Icon from './Icon';

function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();

  return (
    <label className="flex min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300 focus-within:border-brand-300/60">
      <Icon name="search" size={17} className="text-slate-500" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('collection.searchPlaceholder')}
        aria-label={t('collection.searchPlaceholder')}
        className="w-full bg-transparent text-slate-100 outline-hidden placeholder:text-slate-500"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} className="text-slate-500 hover:text-white" aria-label={t('collection.clearSearch')}>
          <Icon name="x" size={15} />
        </button>
      ) : null}
    </label>
  );
}

export default SearchBar;
