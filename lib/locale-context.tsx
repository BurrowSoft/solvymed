import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocale, setAppLocale } from './i18n';

const LOCALE_KEY = '@solvymed/locale';

interface LocaleContextValue {
  locale: string;
  setLocale: (code: string) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: getLocale(),
  setLocale: async () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(getLocale());

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then(saved => {
      if (saved && saved !== getLocale()) {
        setAppLocale(saved);
        setLocaleState(saved);
      }
    }).catch(() => {});
  }, []);

  async function setLocale(code: string) {
    setAppLocale(code);
    setLocaleState(code);
    try { await AsyncStorage.setItem(LOCALE_KEY, code); } catch {}
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
