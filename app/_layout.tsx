import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { scheduleRemindersForToday } from '@/lib/notifications';

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(v => {
      setOnboardingDone(!!v);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !onboardingChecked) return;
    if (!onboardingDone) {
      router.replace('/onboarding');
      return;
    }
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)/schedule/index');
    }
  }, [session, loading, onboardingChecked, onboardingDone]);

  useEffect(() => {
    if (!session) return;
    scheduleRemindersForToday(session.user.id).catch(() => {});
  }, [session]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
