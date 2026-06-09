export type ThemeKey = 'light' | 'dark' | 'warm' | 'ocean';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  blocked: string;
  blockedBg: string;
  success: string;
  warning: string;
  danger: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  light: {
    primary: '#208AEF',
    primaryDark: '#1670CC',
    primaryLight: '#E8F4FE',
    background: '#F5F7FA',
    surface: '#FFFFFF',
    border: '#E5E9F0',
    textPrimary: '#1A2138',
    textSecondary: '#6B7A99',
    textMuted: '#A0ABBE',
    blocked: '#C8CDD8',
    blockedBg: '#EDEFF4',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    tabBar: '#FFFFFF',
    tabBarActive: '#208AEF',
    tabBarInactive: '#A0ABBE',
  },
  dark: {
    primary: '#4DA6FF',
    primaryDark: '#2E8FE8',
    primaryLight: '#1A2E4A',
    background: '#0F1623',
    surface: '#1C2333',
    border: '#2D3A52',
    textPrimary: '#E8ECF4',
    textSecondary: '#8898B8',
    textMuted: '#5A6B88',
    blocked: '#2D3A52',
    blockedBg: '#1C2333',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    tabBar: '#1C2333',
    tabBarActive: '#4DA6FF',
    tabBarInactive: '#5A6B88',
  },
  warm: {
    primary: '#E07B39',
    primaryDark: '#C4622A',
    primaryLight: '#FEF0E6',
    background: '#FBF7F2',
    surface: '#FFFAF5',
    border: '#E8D9C8',
    textPrimary: '#2C1A0E',
    textSecondary: '#7A5C44',
    textMuted: '#A88A74',
    blocked: '#D9C4B2',
    blockedBg: '#F2E8DC',
    success: '#3DAA62',
    warning: '#D97706',
    danger: '#DC2626',
    tabBar: '#FFFAF5',
    tabBarActive: '#E07B39',
    tabBarInactive: '#A88A74',
  },
  ocean: {
    primary: '#0AAFA6',
    primaryDark: '#088E87',
    primaryLight: '#E0F7F6',
    background: '#F0FAFA',
    surface: '#FFFFFF',
    border: '#C2E8E6',
    textPrimary: '#0A2E2D',
    textSecondary: '#3D7A78',
    textMuted: '#7AB3B1',
    blocked: '#B2D8D7',
    blockedBg: '#E0F0EF',
    success: '#1CB87A',
    warning: '#F59E0B',
    danger: '#EF4444',
    tabBar: '#FFFFFF',
    tabBarActive: '#0AAFA6',
    tabBarInactive: '#7AB3B1',
  },
};
