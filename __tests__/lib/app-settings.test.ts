import AsyncStorage from '@react-native-async-storage/async-storage';
// AsyncStorage is mocked in jest.setup.js with an in-memory store
import { loadSettings, saveSettings, patchSettings, AppSettings } from '../../lib/app-settings';

const SETTINGS_KEY = '@solvymed/settings';

const DEFAULT: AppSettings = {
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

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ─── loadSettings ─────────────────────────────────────────────────────────────

describe('loadSettings()', () => {
  it('returns defaults when AsyncStorage is empty', async () => {
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT);
  });

  it('returns stored settings when they exist', async () => {
    const custom: AppSettings = { ...DEFAULT, defaultDurationMinutes: 60, theme: 'dark' };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(custom));
    const s = await loadSettings();
    expect(s.defaultDurationMinutes).toBe(60);
    expect(s.theme).toBe('dark');
  });

  it('merges stored partial settings with defaults', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'ocean' }));
    const s = await loadSettings();
    expect(s.theme).toBe('ocean');
    expect(s.defaultDurationMinutes).toBe(30);
  });

  it('returns defaults when stored JSON is corrupt', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, 'not-valid-json{{');
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT);
  });
});

// ─── saveSettings ─────────────────────────────────────────────────────────────

describe('saveSettings()', () => {
  it('persists settings to AsyncStorage', async () => {
    const custom: AppSettings = { ...DEFAULT, theme: 'warm', defaultDurationMinutes: 45 };
    await saveSettings(custom);
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.theme).toBe('warm');
    expect(parsed.defaultDurationMinutes).toBe(45);
  });

  it('overwrites previously saved settings', async () => {
    await saveSettings({ ...DEFAULT, theme: 'dark' });
    await saveSettings({ ...DEFAULT, theme: 'light' });
    const s = await loadSettings();
    expect(s.theme).toBe('light');
  });
});

// ─── patchSettings ────────────────────────────────────────────────────────────

describe('patchSettings()', () => {
  it('updates only specified fields', async () => {
    await saveSettings({ ...DEFAULT, theme: 'dark', defaultDurationMinutes: 45 });
    const updated = await patchSettings({ remindersEnabled: false });
    expect(updated.remindersEnabled).toBe(false);
    expect(updated.theme).toBe('dark');
    expect(updated.defaultDurationMinutes).toBe(45);
  });

  it('returns the full updated settings object', async () => {
    const result = await patchSettings({ reminderLeadMinutes: 60 });
    expect(result.reminderLeadMinutes).toBe(60);
    expect(result.defaultDurationMinutes).toBe(DEFAULT.defaultDurationMinutes);
    expect(result.theme).toBe(DEFAULT.theme);
  });

  it('can patch multiple fields at once', async () => {
    const result = await patchSettings({
      theme: 'ocean',
      biometricLockEnabled: true,
      autoLockMinutes: 15,
    });
    expect(result.theme).toBe('ocean');
    expect(result.biometricLockEnabled).toBe(true);
    expect(result.autoLockMinutes).toBe(15);
  });

  it('persists the patch so loadSettings returns updated values', async () => {
    await patchSettings({ defaultPaymentType: 'insurance' });
    const s = await loadSettings();
    expect(s.defaultPaymentType).toBe('insurance');
  });

  it('does not mutate the original defaults when patching empty storage', async () => {
    const result = await patchSettings({ invoiceFooterText: 'Thank you' });
    expect(result.defaultDurationMinutes).toBe(DEFAULT.defaultDurationMinutes);
    expect(result.invoiceFooterText).toBe('Thank you');
  });
});

// ─── field validation coverage ───────────────────────────────────────────────

describe('settings field types', () => {
  it('saves and retrieves a boolean', async () => {
    await patchSettings({ dailySummaryEnabled: true });
    const s = await loadSettings();
    expect(s.dailySummaryEnabled).toBe(true);
  });

  it('saves and retrieves a string', async () => {
    await patchSettings({ invoiceFooterText: 'CNPJ: 00.000.000/0001-00' });
    const s = await loadSettings();
    expect(s.invoiceFooterText).toBe('CNPJ: 00.000.000/0001-00');
  });

  it('saves and retrieves a number', async () => {
    await patchSettings({ autoLockMinutes: 30 });
    const s = await loadSettings();
    expect(s.autoLockMinutes).toBe(30);
  });

  it('all valid theme keys are accepted', async () => {
    for (const theme of ['light', 'dark', 'warm', 'ocean'] as const) {
      await patchSettings({ theme });
      const s = await loadSettings();
      expect(s.theme).toBe(theme);
    }
  });

  it('all valid apptType values are accepted', async () => {
    for (const t of ['online', 'inPerson'] as const) {
      await patchSettings({ defaultApptType: t });
      const s = await loadSettings();
      expect(s.defaultApptType).toBe(t);
    }
  });
});
