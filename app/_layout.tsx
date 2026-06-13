import React, { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LocaleProvider, useLocale } from '@/lib/locale-context';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { RoleProvider, useRole } from '@/lib/role-context';
import { scheduleRemindersForToday } from '@/lib/notifications';
import { loadSettings } from '@/lib/app-settings';
import { registerPushToken } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── AppLock ─────────────────────────────────────────────────────────────────

function AppLock({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  async function handleAppStateChange(state: AppStateStatus) {
    if (state === 'background' || state === 'inactive') {
      backgroundedAt.current = Date.now();
      return;
    }
    if (state === 'active' && backgroundedAt.current !== null) {
      const elapsed = (Date.now() - backgroundedAt.current) / 1000 / 60;
      backgroundedAt.current = null;
      const settings = await loadSettings().catch(() => null);
      if (!settings) return;
      if (!settings.biometricLockEnabled) return;
      if (settings.autoLockMinutes > 0 && elapsed < settings.autoLockMinutes) return;
      setLocked(true);
      tryBiometric();
    }
  }

  async function tryBiometric() {
    try {
      const LocalAuth = require('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({ promptMessage: 'Unlock SolvyMed' });
      if (result.success) setLocked(false);
    } catch {
      setLocked(false);
    }
  }

  if (locked) {
    return (
      <View style={lockStyles.screen}>
        <Ionicons name="lock-closed" size={48} color={Colors.primary} />
        <Text style={lockStyles.text}>SolvyMed is locked</Text>
        <TouchableOpacity style={lockStyles.btn} onPress={tryBiometric}>
          <Ionicons name="finger-print-outline" size={20} color="#fff" />
          <Text style={lockStyles.btnText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const lockStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: Colors.background },
  text: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── SplashLoader ────────────────────────────────────────────────────────────

function SplashLoader() {
  return (
    <View style={splashStyles.container}>
      <Text style={splashStyles.logo}>S</Text>
      <Text style={splashStyles.name}>SolvyMed</Text>
      <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 32 }} />
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, gap: 4 },
  logo: { fontSize: 52, fontWeight: '900', color: Colors.primary },
  name: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.5 },
});

// ─── RootNavigator ────────────────────────────────────────────────────────────

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{ access: string; refresh: string } | null>(null);
  const { locale } = useLocale();
  const { theme } = useTheme();
  const { refresh: refreshRole } = useRole();

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(v => {
      setOnboardingDone(!!v);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    function handleDeepLink(url: string | null) {
      if (!url) return;
      try {
        const { queryParams } = Linking.parse(url);
        const access = queryParams?.access_token as string | undefined;
        const refresh = queryParams?.refresh_token as string | undefined;
        const type = queryParams?.type as string | undefined;
        if (!access) return;
        if (type === 'recovery') {
          setPendingRecovery({ access, refresh: refresh ?? '' });
        } else {
          supabase.auth.setSession({ access_token: access, refresh_token: refresh ?? '' }).catch(() => {});
        }
      } catch {}
    }
    Linking.getInitialURL().then(handleDeepLink).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading || !onboardingChecked) return;

    if (pendingRecovery) {
      router.replace({
        pathname: '/(auth)/reset-password',
        params: { access_token: pendingRecovery.access, refresh_token: pendingRecovery.refresh },
      } as never);
      setPendingRecovery(null);
      return;
    }

    if (!onboardingDone) {
      // Re-read storage — finish() writes to AsyncStorage but doesn't update this
      // component's local state. If the user just completed onboarding and then
      // successfully signs in, session changes trigger this effect before
      // onboardingDone reflects the persisted value.
      AsyncStorage.getItem('onboarding_done').then(v => {
        if (v) {
          setOnboardingDone(true);
        } else {
          router.replace('/onboarding');
        }
      });
      return;
    }
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';
    const inResetPassword = segments[1] === 'reset-password';
    const isPatient = session?.user?.user_metadata?.role === 'patient';
    const homeTab = isPatient ? '/(tabs)/discover' : '/(tabs)/schedule';
    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth && !inResetPassword) {
      router.replace(homeTab as never);
    } else if (session && !inAuth && !inTabs) {
      router.replace(homeTab as never);
    }
  }, [session, loading, onboardingChecked, onboardingDone, pendingRecovery]);

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    scheduleRemindersForToday(userId).catch(() => {});
    refreshRole(userId).catch(() => {});
    registerForPush(userId).catch(() => {});
  }, [session?.user.id]);

  async function registerForPush(userId: string) {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      const status = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      await registerPushToken(userId, token);
    } catch {}
  }

  if (loading || !onboardingChecked) {
    return <SplashLoader />;
  }

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack key={theme} screenOptions={{ headerShown: false }} />
    </>
  );
}

// ─── RootLayout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <RoleProvider>
            <AppLock>
              <RootNavigator />
            </AppLock>
          </RoleProvider>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
