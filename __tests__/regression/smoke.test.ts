/**
 * Regression: Smoke tests — run on every release
 *
 * These tests verify critical invariants that must never break.
 * They are intentionally broad and fast, not exhaustive.
 * If any of these fail, the release is blocked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAppLocale, getLocale, t } from '../../lib/i18n';
import { loadSettings, saveSettings, patchSettings } from '../../lib/app-settings';
import { setAppTheme, getAppTheme, Colors } from '../../constants/Colors';
import { THEMES } from '../../constants/themes';

beforeEach(async () => {
  await AsyncStorage.clear();
  setAppLocale('en');
  setAppTheme('light');
});

// ─── i18n smoke ──────────────────────────────────────────────────────────────

describe('[smoke] i18n', () => {
  it('all 6 locales load without crashing', () => {
    const locales = ['en', 'pt-BR', 'fr-FR', 'de-DE', 'it-IT', 'es-ES'];
    for (const locale of locales) {
      expect(() => setAppLocale(locale)).not.toThrow();
      expect(getLocale()).toBe(locale);
    }
  });

  it('critical UI keys exist in all locales', () => {
    const keys = [
      'common.save', 'common.cancel', 'common.add',
      'newAppt.inPerson', 'newAppt.online',
      'settings.group.scheduling', 'settings.group.notifications',
      'settings.group.appearance', 'settings.group.security', 'settings.group.financial',
      'settings.group.data',
    ] as const;
    const locales = ['en', 'pt-BR', 'fr-FR', 'de-DE', 'it-IT', 'es-ES'];
    for (const locale of locales) {
      setAppLocale(locale);
      for (const key of keys) {
        const val = t(key);
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      }
    }
  });

  it('t() never throws for any defined key', () => {
    expect(() => t('common.save')).not.toThrow();
    expect(() => t('settings.theme.ocean')).not.toThrow();
    expect(() => t('settings.security.autoLock.never')).not.toThrow();
  });
});

// ─── Settings smoke ───────────────────────────────────────────────────────────

describe('[smoke] settings', () => {
  it('loadSettings() returns defaults on fresh install', async () => {
    const s = await loadSettings();
    expect(s.defaultDurationMinutes).toBe(30);
    expect(s.theme).toBe('light');
    expect(s.remindersEnabled).toBe(true);
    expect(s.defaultPaymentType).toBe('private');
    expect(typeof s.invoiceFooterText).toBe('string');
  });

  it('saveSettings / loadSettings round-trip is lossless', async () => {
    const original = await loadSettings();
    await saveSettings({ ...original, theme: 'warm', autoLockMinutes: 15 });
    const reloaded = await loadSettings();
    expect(reloaded.theme).toBe('warm');
    expect(reloaded.autoLockMinutes).toBe(15);
    expect(reloaded.defaultDurationMinutes).toBe(original.defaultDurationMinutes);
  });

  it('corrupt stored JSON falls back to defaults', async () => {
    await AsyncStorage.setItem('@solvymed/settings', 'NOT_JSON{{{{');
    const s = await loadSettings();
    expect(s.theme).toBe('light');
    expect(s.defaultDurationMinutes).toBe(30);
  });

  it('patchSettings partial update does not clobber unrelated fields', async () => {
    await patchSettings({ theme: 'dark' });
    await patchSettings({ remindersEnabled: false });
    const s = await loadSettings();
    expect(s.theme).toBe('dark');
    expect(s.remindersEnabled).toBe(false);
    expect(s.defaultDurationMinutes).toBe(30);
  });
});

// ─── Theme smoke ──────────────────────────────────────────────────────────────

describe('[smoke] themes', () => {
  it('all 4 themes have required color keys', () => {
    const requiredKeys = [
      'primary', 'background', 'surface', 'border',
      'textPrimary', 'textSecondary', 'textMuted',
    ];
    for (const key of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
      for (const colorKey of requiredKeys) {
        expect((THEMES[key] as any)[colorKey]).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      }
    }
  });

  it('setAppTheme mutates Colors and is reflected in getAppTheme', () => {
    setAppTheme('ocean');
    expect(getAppTheme()).toBe('ocean');
    expect(Colors.background).toBe(THEMES.ocean.background);
  });

  it('Colors object is the same reference after theme change', () => {
    const ref = Colors;
    setAppTheme('dark');
    expect(Colors).toBe(ref);
  });

  it('switching back to light restores light palette', () => {
    setAppTheme('dark');
    setAppTheme('light');
    expect(Colors.background).toBe(THEMES.light.background);
  });
});

// ─── AsyncStorage smoke ───────────────────────────────────────────────────────

describe('[smoke] AsyncStorage integration', () => {
  it('stores and retrieves a string', async () => {
    await AsyncStorage.setItem('test-key', 'test-value');
    const val = await AsyncStorage.getItem('test-key');
    expect(val).toBe('test-value');
  });

  it('returns null for missing key', async () => {
    const val = await AsyncStorage.getItem('non-existent-key');
    expect(val).toBeNull();
  });

  it('clear() removes all keys', async () => {
    await AsyncStorage.setItem('k1', 'v1');
    await AsyncStorage.setItem('k2', 'v2');
    await AsyncStorage.clear();
    expect(await AsyncStorage.getItem('k1')).toBeNull();
  });
});
