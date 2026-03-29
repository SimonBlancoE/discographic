import { useI18n } from '../lib/I18nContext';

function SearchBar({ value, onChange }) {
  const { t } = useI18n();

  return (
    <label className="flex min-w-[240px] flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 focus-within:border-brand-300 focus-within:bg-white/10">
      <span className="text-base">🔎</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('collection.searchPlaceholder')}
        className="w-full bg-transparent outline-none placeholder:text-slate-500"
      />
    </label>
  );
}

export default SearchBar;
