import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useLocale } from '@/lib/locale-context';
import { detectLocale, tWith } from '@/lib/i18n';

const { width } = Dimensions.get('window');

// ─── Language picker data ─────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en',    flag: '🇬🇧', nativeName: 'English',              englishName: 'English' },
  { code: 'pt-BR', flag: '🇧🇷', nativeName: 'Português',            englishName: 'Portuguese (Brazil)' },
  { code: 'es-ES', flag: '🇪🇸', nativeName: 'Español',              englishName: 'Spanish' },
  { code: 'fr-FR', flag: '🇫🇷', nativeName: 'Français',             englishName: 'French' },
  { code: 'de-DE', flag: '🇩🇪', nativeName: 'Deutsch',              englishName: 'German' },
  { code: 'it-IT', flag: '🇮🇹', nativeName: 'Italiano',             englishName: 'Italian' },
];

// ─── Onboarding slides ────────────────────────────────────────────────────────

const SLIDES = [
  { key: 'welcome',  icon: 'heart-outline' as const,   color: Colors.primary },
  { key: 'schedule', icon: 'calendar-outline' as const, color: '#7C3AED' },
  { key: 'patients', icon: 'people-outline' as const,   color: '#059669' },
  { key: 'payments', icon: 'cash-outline' as const,     color: '#D97706' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { setLocale } = useLocale();
  const listRef = useRef<FlatList>(null);
  const [step, setStep] = useState<'language' | 'slides'>('language');
  const [selectedLocale, setSelectedLocale] = useState(detectLocale());
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  function confirmLanguage() {
    setStep('slides');
  }

  async function finish() {
    // Write onboarding_done BEFORE setLocale. setLocale changes the locale
    // context which re-keys the Stack and remounts RootNavigator. If
    // onboarding_done isn't saved yet when RootNavigator first reads it,
    // the navigator routes back to /onboarding (the race condition).
    await AsyncStorage.setItem('onboarding_done', '1');
    await setLocale(selectedLocale);
    router.replace('/(auth)/login');
  }

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      finish();
    }
  }

  // ─── Language picker ────────────────────────────────────────────────────────

  if (step === 'language') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.langHeader}>
          <View style={styles.globeCircle}>
            <Ionicons name="globe-outline" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.langTitle}>{tWith('onboarding.language.title' as any, selectedLocale)}</Text>
          <Text style={styles.langSubtitle}>{tWith('onboarding.language.subtitle' as any, selectedLocale)}</Text>
        </View>

        <ScrollView
          style={styles.langList}
          contentContainerStyle={styles.langListContent}
          showsVerticalScrollIndicator={false}
        >
          {LANGUAGES.map(lang => {
            const selected = selectedLocale === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langRow, selected && styles.langRowSelected]}
                onPress={() => setSelectedLocale(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <View style={styles.langNames}>
                  <Text style={[styles.langNative, selected && { color: Colors.primary }]}>
                    {lang.nativeName}
                  </Text>
                  <Text style={styles.langEnglish}>{lang.englishName}</Text>
                </View>
                {selected && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.continueBtn} onPress={confirmLanguage}>
            <Text style={styles.continueBtnText}>{tWith('onboarding.language.continue' as any, selectedLocale)}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Slides ─────────────────────────────────────────────────────────────────

  const slide = SLIDES[index];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>{tWith('onboarding.skip' as any, selectedLocale)}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={s => s.key}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon} size={72} color={item.color} />
            </View>
            <Text style={[styles.title, { color: item.color }]}>
              {tWith(`onboarding.slide.${item.key}.title` as any, selectedLocale)}
            </Text>
            <Text style={styles.body}>
              {tWith(`onboarding.slide.${item.key}.body` as any, selectedLocale)}
            </Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index
                ? [styles.dotActive, { backgroundColor: slide.color }]
                : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: slide.color }]}
          onPress={next}
        >
          <Text style={styles.nextBtnText}>
            {tWith(index === SLIDES.length - 1 ? 'onboarding.getStarted' : 'onboarding.next' as any, selectedLocale)}
          </Text>
          <Ionicons
            name={index === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={18}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // Language picker
  langHeader: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, gap: 10, paddingBottom: 24 },
  globeCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  langTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  langSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  langList: { flex: 1 },
  langListContent: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  langRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  langFlag: { fontSize: 28 },
  langNames: { flex: 1, gap: 2 },
  langNative: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  langEnglish: { fontSize: 13, color: Colors.textMuted },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Slides
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  skipBtn: { padding: 8 },
  skipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  body: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 20 },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  dotInactive: { width: 8, backgroundColor: Colors.border },
  footer: { paddingHorizontal: 32, paddingBottom: 24 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
