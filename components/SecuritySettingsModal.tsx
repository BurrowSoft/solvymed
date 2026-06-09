import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Switch, ScrollView, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { AppSettings } from '@/lib/app-settings';

interface Props {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => void;
}

const AUTO_LOCK_OPTIONS = [
  { minutes: 0, labelKey: 'settings.security.autoLock.never' as const },
  { minutes: 5, labelKey: 'settings.security.autoLock.5min' as const },
  { minutes: 15, labelKey: 'settings.security.autoLock.15min' as const },
  { minutes: 30, labelKey: 'settings.security.autoLock.30min' as const },
];

export function SecuritySettingsModal({ visible, settings, onClose, onSave }: Props) {
  const [biometric, setBiometric] = useState(settings.biometricLockEnabled);
  const [autoLock, setAutoLock] = useState(settings.autoLockMinutes);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    if (!visible) return;
    checkBiometricAvailability();
  }, [visible]);

  async function checkBiometricAvailability() {
    try {
      const LocalAuth = require('expo-local-authentication');
      const supported = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      setBiometricAvailable(supported && enrolled);
    } catch {
      setBiometricAvailable(false);
    }
  }

  async function handleBiometricToggle(value: boolean) {
    if (value && !biometricAvailable) {
      Alert.alert(
        t('settings.security.biometric'),
        'Biometric authentication is not available on this device.',
        [{ text: 'OK' }],
      );
      return;
    }
    if (value) {
      try {
        const LocalAuth = require('expo-local-authentication');
        const result = await LocalAuth.authenticateAsync({ promptMessage: 'Confirm your identity to enable lock' });
        if (!result.success) return;
      } catch {
        return;
      }
    }
    setBiometric(value);
  }

  function handleSave() {
    onSave({ biometricLockEnabled: biometric, autoLockMinutes: autoLock });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.group.security')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIcon}>
              <Ionicons name="finger-print-outline" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('settings.security.biometric')}</Text>
              {!biometricAvailable && (
                <Text style={styles.toggleSubtitle}>Not available on this device</Text>
              )}
            </View>
            <Switch
              value={biometric}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
              disabled={!biometricAvailable && !biometric}
            />
          </View>

          <Text style={styles.sectionLabel}>{t('settings.security.autoLock')}</Text>
          {AUTO_LOCK_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.minutes}
              style={styles.optionRow}
              onPress={() => setAutoLock(opt.minutes)}
            >
              <Text style={[styles.optionText, autoLock === opt.minutes && styles.optionTextActive]}>
                {t(opt.labelKey)}
              </Text>
              {autoLock === opt.minutes && (
                <Ionicons name="checkmark" size={18} color={Colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        </TouchableOpacity>
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
    maxHeight: '75%',
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
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  toggleIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  toggleSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  optionText: { fontSize: 14, color: Colors.textSecondary },
  optionTextActive: { color: Colors.primary, fontWeight: '600' },
  saveBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
