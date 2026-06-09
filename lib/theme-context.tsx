import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAppTheme, setAppTheme } from '@/constants/Colors';
import { patchSettings, loadSettings } from './app-settings';
import { ThemeKey } from '@/constants/themes';

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (key: ThemeKey) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(getAppTheme());

  useEffect(() => {
    loadSettings().then(s => {
      if (s.theme !== getAppTheme()) {
        setAppTheme(s.theme);
        setThemeState(s.theme);
      }
    }).catch(() => {});
  }, []);

  async function setTheme(key: ThemeKey) {
    setAppTheme(key);
    setThemeState(key);
    await patchSettings({ theme: key }).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
