import '@testing-library/jest-native/extend-expect';

// ─── Supabase (prevent "supabaseUrl is required" at import time) ──────────────

jest.mock('./lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://mock.url/file.jpg' } })),
        remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  },
}));

// ─── AsyncStorage (in-memory mock) ───────────────────────────────────────────

const asyncStorageStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => asyncStorageStore[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => { asyncStorageStore[key] = value; }),
  removeItem: jest.fn(async (key: string) => { delete asyncStorageStore[key]; }),
  clear: jest.fn(async () => { Object.keys(asyncStorageStore).forEach(k => delete asyncStorageStore[k]); }),
  getAllKeys: jest.fn(async () => Object.keys(asyncStorageStore)),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, asyncStorageStore[k] ?? null])),
}));

// ─── expo-notifications ───────────────────────────────────────────────────────

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// ─── expo-local-authentication ───────────────────────────────────────────────

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

// ─── expo-constants ───────────────────────────────────────────────────────────

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

// ─── expo-file-system ─────────────────────────────────────────────────────────

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}));

// ─── expo-sharing ─────────────────────────────────────────────────────────────

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── expo-font ────────────────────────────────────────────────────────────────

jest.mock('expo-font', () => ({
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
  isLoading: jest.fn().mockReturnValue(false),
}));

// ─── @expo/vector-icons ───────────────────────────────────────────────────────

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockIcon = (props: any) => React.createElement(Text, null, props.name ?? '');
  return {
    Ionicons: MockIcon,
    MaterialIcons: MockIcon,
    FontAwesome: MockIcon,
    AntDesign: MockIcon,
    Feather: MockIcon,
  };
});
