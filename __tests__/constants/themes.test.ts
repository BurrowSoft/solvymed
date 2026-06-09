import { THEMES, ThemeKey } from '../../constants/themes';

const THEME_KEYS: ThemeKey[] = ['light', 'dark', 'warm', 'ocean'];

const REQUIRED_KEYS = [
  'primary', 'primaryDark', 'primaryLight',
  'background', 'surface', 'border',
  'textPrimary', 'textSecondary', 'textMuted',
  'blocked', 'blockedBg',
  'success', 'warning', 'danger',
  'tabBar', 'tabBarActive', 'tabBarInactive',
] as const;

const HEX_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

describe('THEMES', () => {
  it('contains all 4 theme keys', () => {
    expect(Object.keys(THEMES)).toEqual(expect.arrayContaining(THEME_KEYS));
  });

  for (const key of THEME_KEYS) {
    describe(`theme: ${key}`, () => {
      it('has all required color keys', () => {
        for (const colorKey of REQUIRED_KEYS) {
          expect(THEMES[key]).toHaveProperty(colorKey);
        }
      });

      it('has valid hex color values for all keys', () => {
        for (const colorKey of REQUIRED_KEYS) {
          const value = THEMES[key][colorKey];
          expect(value).toMatch(HEX_REGEX);
        }
      });

      it('primary is distinct from background', () => {
        expect(THEMES[key].primary).not.toBe(THEMES[key].background);
      });

      it('tabBarActive matches primary', () => {
        expect(THEMES[key].tabBarActive).toBe(THEMES[key].primary);
      });
    });
  }

  it('each theme has a unique background color', () => {
    const backgrounds = THEME_KEYS.map(k => THEMES[k].background);
    const unique = new Set(backgrounds);
    expect(unique.size).toBe(THEME_KEYS.length);
  });

  it('each theme has a unique primary color', () => {
    const primaries = THEME_KEYS.map(k => THEMES[k].primary);
    const unique = new Set(primaries);
    expect(unique.size).toBe(THEME_KEYS.length);
  });

  it('dark theme has a dark background', () => {
    const bg = THEMES.dark.background;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    const luminance = (r + g + b) / 3;
    expect(luminance).toBeLessThan(50);
  });

  it('light theme has a light background', () => {
    const bg = THEMES.light.background;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    const luminance = (r + g + b) / 3;
    expect(luminance).toBeGreaterThan(200);
  });
});
