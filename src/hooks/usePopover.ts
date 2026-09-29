import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Anchored popover menu state: positions a portal panel under its trigger button, closes on
 * outside click or Escape, moves focus into the panel when it opens and back to the trigger
 * when it closes from the keyboard.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current || !panelRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => {
      updatePosition();
      panelRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]')?.focus();
    });

    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }

    function handleFocusOut(event: FocusEvent) {
      const next = event.relatedTarget;
      if (next instanceof Node && !panelRef.current?.contains(next) && !buttonRef.current?.contains(next)) {
        setOpen(false);
      }
    }

    const panel = panelRef.current;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    panel?.addEventListener('focusout', handleFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      panel?.removeEventListener('focusout', handleFocusOut);
    };
  }, [close, open, updatePosition]);

  return {
    open,
    setOpen,
    close,
    buttonRef,
    panelRef,
    triggerProps: {
      'aria-expanded': open,
      'aria-haspopup': 'menu' as const,
      onClick: () => setOpen((previous) => !previous),
    },
  };
}
