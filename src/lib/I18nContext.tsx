import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentLocale, persistLocale, resolveLocale, translate } from '../../shared/i18n.js';
import type { ChildrenProp, I18nContextValue } from './types';

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: ChildrenProp) {
  const [locale, setLocaleState] = useState(() => getCurrentLocale());

  useEffect(() => {
    const nextLocale = resolveLocale(locale);
    persistLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale(nextLocale: string) {
      setLocaleState(resolveLocale(nextLocale));
    },
    t(key, vars) {
      return translate(locale, key, vars);
    }
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
