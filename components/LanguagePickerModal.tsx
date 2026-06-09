import React from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

const LANGUAGES = [
  { code: 'pt-BR', name: 'Português',  flag: '🇧🇷' },
  { code: 'en',    name: 'English',    flag: '🇬🇧' },
  { code: 'fr-FR', name: 'Français',   flag: '🇫🇷' },
  { code: 'de-DE', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'es-ES', name: 'Español',    flag: '🇪🇸' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePickerModal({ visible, onClose }: Props) {
  const { locale, setLocale } = useLocale();

  async function handleSelect(code: string) {
    await setLocale(code);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('settings.language')}</Text>
        <ScrollView>
          {LANGUAGES.map((lang, i) => {
            const selected = locale === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.row, i < LANGUAGES.length - 1 && styles.rowBorder]}
                onPress={() => handleSelect(lang.code)}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.name, selected && styles.nameSelected]}>{lang.name}</Text>
                {selected && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  flag: {
    fontSize: 24,
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  nameSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
});
