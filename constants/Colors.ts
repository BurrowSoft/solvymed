import { THEMES, ThemeKey } from './themes';

let _theme: ThemeKey = 'light';

export function getAppTheme(): ThemeKey { return _theme; }

export function setAppTheme(key: ThemeKey): void {
  _theme = key;
  Object.assign(Colors, THEMES[key]);
}

export const Colors = { ...THEMES.light };
