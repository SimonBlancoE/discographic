import { createPortal } from 'react-dom';
import { COLUMNS, MANDATORY, type ColumnId } from '../lib/columns';
import { useI18n } from '../lib/I18nContext';
import { usePopover } from '../hooks/usePopover';
import Icon from './Icon';

function ColumnToggle({
  visibleColumns,
  onToggle,
}: {
  visibleColumns: ColumnId[];
  onToggle: (columnId: ColumnId) => void;
}) {
  const { t } = useI18n();
  const { open, buttonRef, panelRef, triggerProps } = usePopover();

  return (
    <>
      <button ref={buttonRef} type="button" {...triggerProps} className="secondary-button">
        <Icon name="layers" size={16} />
        {t('collection.columns')}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="group"
          aria-label={t('collection.columns')}
          className="fixed z-50 min-w-[210px] rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-lg backdrop-blur-xl"
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
