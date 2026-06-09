import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: 'heart-outline',
    title: 'Welcome to SolvyMed',
    body: 'Your complete clinic management solution. Manage appointments, patients, and payments — all in one place.',
    color: Colors.primary,
  },
  {
    key: 'schedule',
    icon: 'calendar-outline',
    title: 'Smart Scheduling',
    body: 'View your day or week at a glance. Create appointments, block time slots, and get 15-minute reminders before each session.',
    color: '#7C3AED',
  },
  {
    key: 'patients',
    icon: 'people-outline',
    title: 'Patient Records',
    body: 'Keep full patient histories: medical records, prescriptions, appointments, and contact info — all organised and searchable.',
    color: '#059669',
  },
  {
    key: 'payments',
    icon: 'cash-outline',
    title: 'Payment Tracking',
    body: 'Track private and insurance payments. See pending amounts, mark sessions as paid, and review your monthly revenue report.',
    color: '#D97706',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', '1');
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

  const slide = SLIDES[index];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
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
            <Text style={[styles.title, { color: item.color }]}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
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

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: slide.color }]}
          onPress={next}
        >
          <Text style={styles.nextBtnText}>
            {index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
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
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  skipBtn: { padding: 8 },
  skipText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
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
