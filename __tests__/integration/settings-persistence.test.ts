/**
 * Integration: Settings persistence round-trip
 *
 * Verifies that saving settings via the settings API and then re-loading
 * them (simulating an app restart) returns the exact same values.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, saveSettings, patchSettings, AppSettings } from '../../lib/app-settings';
import { setAppTheme, getAppTheme, Colors } from '../../constants/Colors';

beforeEach(async () => {
  await AsyncStorage.clear();
  // Reset theme to light before each test
  setAppTheme('light');
});

describe('Settings persistence — save then reload', () => {
  it('full settings object survives a round-trip', async () => {
    const custom: AppSettings = {
      defaultDurationMinutes: 45,
      scheduleSlotIntervalMinutes: 30,
      defaultApptType: 'online',
      remindersEnabled: false,
      reminderLeadMinutes: 60,
      dailySummaryEnabled: true,
      dailySummaryTime: '09:00',
      theme: 'dark',
      biometricLockEnabled: false,
      autoLockMinutes: 15,
      defaultPaymentType: 'insurance',
      invoiceFooterText: 'Thank you for choosing our clinic.',
    };
    await saveSettings(custom);
    const loaded = await loadSettings();
    expect(loaded).toEqual(custom);
  });

  it('partial patch persists and does not lose other fields', async () => {
    await patchSettings({ theme: 'warm', autoLockMinutes: 30 });
    const loaded = await loadSettings();
    expect(loaded.theme).toBe('warm');
    expect(loaded.autoLockMinutes).toBe(30);
    expect(loaded.defaultDurationMinutes).toBe(30);
    expect(loaded.defaultPaymentType).toBe('private');
  });

  it('multiple sequential patches accumulate correctly', async () => {
    await patchSettings({ defaultDurationMinutes: 60 });
    await patchSettings({ theme: 'ocean' });
    await patchSettings({ remindersEnabled: false });
    const loaded = await loadSettings();
    expect(loaded.defaultDurationMinutes).toBe(60);
    expect(loaded.theme).toBe('ocean');
    expect(loaded.remindersEnabled).toBe(false);
    expect(loaded.scheduleSlotIntervalMinutes).toBe(15);
  });

  it('settings are still readable after simulated cache miss (JSON parse)', async () => {
    await saveSettings({
      defaultDurationMinutes: 30,
      scheduleSlotIntervalMinutes: 15,
      defaultApptType: 'inPerson',
      remindersEnabled: true,
      reminderLeadMinutes: 1440,
      dailySummaryEnabled: true,
      dailySummaryTime: '07:30',
      theme: 'light',
      biometricLockEnabled: false,
      autoLockMinutes: 5,
      defaultPaymentType: 'private',
      invoiceFooterText: 'CNPJ: 00.000.000/0001-00',
    });
    const raw = await AsyncStorage.getItem('@solvymed/settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.reminderLeadMinutes).toBe(1440);
    expect(parsed.dailySummaryTime).toBe('07:30');
    expect(parsed.invoiceFooterText).toBe('CNPJ: 00.000.000/0001-00');
  });
});

describe('Theme change propagates to Colors object', () => {
  it('setAppTheme("dark") mutates the shared Colors object', () => {
    setAppTheme('light');
    const lightBg = Colors.background;
    setAppTheme('dark');
    const darkBg = Colors.background;
    expect(darkBg).not.toBe(lightBg);
    expect(getAppTheme()).toBe('dark');
  });

  it('cycling all themes keeps Colors consistent', () => {
    for (const theme of ['light', 'dark', 'warm', 'ocean'] as const) {
      setAppTheme(theme);
      expect(getAppTheme()).toBe(theme);
      expect(typeof Colors.primary).toBe('string');
      expect(Colors.primary).toMatch(/^#/);
    }
  });

  it('settings theme patch + Colors mutation stay in sync', async () => {
    await patchSettings({ theme: 'ocean' });
    const s = await loadSettings();
    setAppTheme(s.theme);
    expect(getAppTheme()).toBe('ocean');
    expect(Colors.primary).toMatch(/^#/);
  });
});
