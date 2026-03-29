import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getCurrentLocale, translate } from '../../shared/i18n';

const ToastContext = createContext(null);

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl flex-col gap-3 sm:right-6 sm:left-auto sm:w-full sm:max-w-sm" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`toast-card pointer-events-auto ${toast.variant === 'error' ? 'toast-card-error' : toast.variant === 'success' ? 'toast-card-success' : 'toast-card-info'}`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {toast.title ? <p className="text-sm font-semibold text-white">{toast.title}</p> : null}
              <p className="mt-1 text-sm text-slate-200/90">{toast.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label={translate(getCurrentLocale(), 'toast.dismiss')}
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(({ title, description, variant = 'info', duration = 4200 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast = { id, title, description, variant };

    setToasts((current) => [...current, nextToast]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  const value = useMemo(() => ({
    showToast,
    success(description, title = translate(getCurrentLocale(), 'toast.success')) {
      showToast({ title, description, variant: 'success' });
    },
    error(description, title = translate(getCurrentLocale(), 'toast.error')) {
      showToast({ title, description, variant: 'error' });
    },
    info(description, title = translate(getCurrentLocale(), 'toast.info')) {
      showToast({ title, description, variant: 'info' });
    }
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }

  return context;
}
