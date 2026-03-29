import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentLocale, persistLocale, resolveLocale, translate } from '../../shared/i18n';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => getCurrentLocale());

  useEffect(() => {
    const nextLocale = resolveLocale(locale);
    persistLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale(nextLocale) {
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
