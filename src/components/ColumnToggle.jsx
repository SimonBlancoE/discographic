import { useEffect, useRef, useState } from 'react';
import { COLUMNS, MANDATORY } from '../lib/columns';
import { useI18n } from '../lib/I18nContext';

function ColumnToggle({ visibleColumns, onToggle }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="secondary-button"
      >
        {t('collection.columns')}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-lg backdrop-blur-xl">
          {COLUMNS.map((col) => {
            const isMandatory = MANDATORY.includes(col.id);
            const isChecked = isMandatory || visibleColumns.includes(col.id);

            return (
              <label
                key={col.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5 ${isMandatory ? 'text-slate-500' : 'text-slate-200'}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isMandatory}
                  onChange={() => onToggle(col.id)}
                  className="accent-brand-300"
                />
                {t(col.i18nKey)}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ColumnToggle;
