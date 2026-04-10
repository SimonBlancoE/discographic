import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLUMNS, MANDATORY } from '../lib/columns';
import { useI18n } from '../lib/I18nContext';

function ColumnToggle({ visibleColumns, onToggle }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.left = `${Math.max(8, rect.right - panel.offsetWidth)}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Position once after render
    requestAnimationFrame(updatePosition);

    function handleClickOutside(event) {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target) &&
        panelRef.current && !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="secondary-button"
      >
        {t('collection.columns')}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-lg backdrop-blur-xl"
        >
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
        </div>,
        document.body
      )}
    </>
  );
}

export default ColumnToggle;
