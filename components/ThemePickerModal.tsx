import React from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { ThemeKey, THEMES } from '@/constants/themes';

interface Props {
  visible: boolean;
  currentTheme: ThemeKey;
  onClose: () => void;
  onSelect: (key: ThemeKey) => void;
}

const THEME_KEYS: ThemeKey[] = ['light', 'dark', 'warm', 'ocean'];

function themeLabelKey(key: ThemeKey): Parameters<typeof t>[0] {
  const map: Record<ThemeKey, Parameters<typeof t>[0]> = {
    light: 'settings.theme.light',
    dark: 'settings.theme.dark',
    warm: 'settings.theme.warm',
    ocean: 'settings.theme.ocean',
  };
  return map[key];
}

export function ThemePickerModal({ visible, currentTheme, onClose, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.appearance.theme')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {THEME_KEYS.map(key => {
            const palette = THEMES[key];
            const selected = currentTheme === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => { onSelect(key); onClose(); }}
                activeOpacity={0.8}
              >
                <View style={styles.swatchRow}>
                  <View style={[styles.swatchLarge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.swatchAccent, { backgroundColor: palette.primary }]} />
                    <View style={styles.swatchBars}>
                      <View style={[styles.swatchBar, { backgroundColor: palette.textPrimary, width: '60%' }]} />
                      <View style={[styles.swatchBar, { backgroundColor: palette.textMuted, width: '40%', marginTop: 4 }]} />
                    </View>
                    <View style={[styles.swatchFooter, { backgroundColor: palette.background }]}>
                      <View style={[styles.swatchDot, { backgroundColor: palette.tabBarActive }]} />
                      <View style={[styles.swatchDot, { backgroundColor: palette.tabBarInactive }]} />
                      <View style={[styles.swatchDot, { backgroundColor: palette.tabBarInactive }]} />
                    </View>
                  </View>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, selected && styles.cardNameSelected]}>
                    {t(themeLabelKey(key))}
                  </Text>
                  <View style={styles.dotRow}>
                    {[palette.primary, palette.background, palette.surface, palette.textPrimary].map((c, i) => (
                      <View key={i} style={[styles.colorDot, { backgroundColor: c, borderColor: palette.border }]} />
                    ))}
                  </View>
                </View>

                {selected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, padding: 12, overflow: 'hidden',
  },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  swatchRow: {},
  swatchLarge: {
    width: 72, height: 56, borderRadius: 10, borderWidth: 1,
    overflow: 'hidden', padding: 6,
  },
  swatchAccent: {
    height: 6, borderRadius: 3, marginBottom: 5,
  },
  swatchBars: { flex: 1 },
  swatchBar: {
    height: 4, borderRadius: 2,
    backgroundColor: '#1A2138',
  },
  swatchFooter: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingTop: 5, marginTop: 4,
  },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  cardNameSelected: { color: Colors.primary },
  dotRow: { flexDirection: 'row', gap: 6 },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  checkBadge: { marginLeft: 4 },
});
