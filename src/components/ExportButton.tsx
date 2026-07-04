import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import type { CollectionFilters } from '../../shared/collectionFilters.js';

type ExportButtonProps = {
  filters: CollectionFilters & { currency?: string };
  disabled?: boolean;
};

function ExportButton({ filters, disabled = false }: ExportButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.left = `${Math.max(8, rect.right - panel.offsetWidth)}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(updatePosition);

    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        buttonRef.current && !buttonRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
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
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="secondary-button flex items-center gap-1.5 disabled:opacity-50"
      >
        {t('collection.export') || 'Exportar'}
        <span className="text-[10px] opacity-75">▼</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 min-w-[160px] rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-lg backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={() => {
              api.exportCollection('csv', filters);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
          >
            📊 {t('collection.exportCsv')}
          </button>
          <button
            type="button"
            onClick={() => {
              api.exportCollection('xlsx', filters);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
          >
            📈 {t('collection.exportExcel')}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default ExportButton;
