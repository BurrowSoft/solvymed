import { Colors, getAppTheme, setAppTheme } from '../../constants/Colors';
import { THEMES } from '../../constants/themes';

afterEach(() => {
  setAppTheme('light');
});

describe('Colors (mutable theme object)', () => {
  it('starts with the light theme', () => {
    setAppTheme('light');
    expect(Colors.primary).toBe(THEMES.light.primary);
    expect(Colors.background).toBe(THEMES.light.background);
  });

  it('setAppTheme swaps all color values', () => {
    setAppTheme('dark');
    expect(Colors.primary).toBe(THEMES.dark.primary);
    expect(Colors.background).toBe(THEMES.dark.background);
    expect(Colors.surface).toBe(THEMES.dark.surface);
    expect(Colors.textPrimary).toBe(THEMES.dark.textPrimary);
  });

  it('getAppTheme returns the current theme key', () => {
    setAppTheme('warm');
    expect(getAppTheme()).toBe('warm');
  });

  it('Colors object is the same reference after theme change', () => {
    const ref = Colors;
    setAppTheme('ocean');
    expect(Colors).toBe(ref);
  });

  it('switches through all themes without error', () => {
    for (const key of ['light', 'dark', 'warm', 'ocean'] as const) {
      expect(() => setAppTheme(key)).not.toThrow();
      expect(getAppTheme()).toBe(key);
      expect(Colors.primary).toBe(THEMES[key].primary);
    }
  });

  it('warm theme primary is distinct from dark theme primary', () => {
    setAppTheme('warm');
    const warmPrimary = Colors.primary;
    setAppTheme('dark');
    expect(Colors.primary).not.toBe(warmPrimary);
  });

  it('ocean theme surface is white', () => {
    setAppTheme('ocean');
    expect(Colors.surface).toBe('#FFFFFF');
  });
});
