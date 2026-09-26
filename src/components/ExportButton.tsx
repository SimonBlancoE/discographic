import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import { usePopover } from '../hooks/usePopover';
import Icon from './Icon';
import type { CollectionFilters } from '../../shared/collectionFilters.js';

type ExportButtonProps = {
  filters: CollectionFilters & { currency?: string };
  disabled?: boolean;
};

const MENU_ITEM = 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5 focus:bg-white/10 focus:outline-hidden';

function ExportButton({ filters, disabled = false }: ExportButtonProps) {
  const { t } = useI18n();
  const { open, close, buttonRef, panelRef, triggerProps } = usePopover();

  function exportAs(format: 'csv' | 'xlsx') {
    api.exportCollection(format, filters);
    close(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        {...triggerProps}
        className="secondary-button disabled:opacity-50"
      >
        <Icon name="download" size={16} />
        {t('collection.export')}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-50 min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-lg backdrop-blur-xl"
        >
          <button type="button" role="menuitem" onClick={() => exportAs('csv')} className={MENU_ITEM}>
            📊 {t('collection.exportCsv')}
          </button>
          <button type="button" role="menuitem" onClick={() => exportAs('xlsx')} className={MENU_ITEM}>
            📈 {t('collection.exportExcel')}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default ExportButton;
