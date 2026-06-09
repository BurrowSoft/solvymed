import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';
import { ThemeKey } from '@/constants/themes';

const SETTINGS_KEY = '@solvymed/settings';

export interface AppSettings {
  defaultDurationMinutes: number;
  scheduleSlotIntervalMinutes: number;
  defaultApptType: 'online' | 'inPerson';
  remindersEnabled: boolean;
  reminderLeadMinutes: number;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  theme: ThemeKey;
  biometricLockEnabled: boolean;
  autoLockMinutes: number;
  defaultPaymentType: 'private' | 'insurance';
  invoiceFooterText: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultDurationMinutes: 30,
  scheduleSlotIntervalMinutes: 15,
  defaultApptType: 'inPerson',
  remindersEnabled: true,
  reminderLeadMinutes: 15,
  dailySummaryEnabled: false,
  dailySummaryTime: '08:00',
  theme: 'light',
  biometricLockEnabled: false,
  autoLockMinutes: 0,
  defaultPaymentType: 'private',
  invoiceFooterText: '',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = { ...current, ...patch };
  await saveSettings(updated);
  return updated;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then(s => { setSettings(s); setLoaded(true); });
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await patchSettings(patch);
    setSettings(updated);
    return updated;
  }, []);

  return { settings, loaded, update };
}
