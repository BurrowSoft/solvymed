import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t, getLocale } from '@/lib/i18n';
import { AppSettings } from '@/lib/app-settings';

const isPtBR = getLocale() === 'pt-BR';

interface Props {
  visible: boolean;
  settings: AppSettings;
  pixKey?: string;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => void;
  onSavePixKey?: (key: string) => void;
}

export function FinancialSettingsModal({ visible, settings, pixKey, onClose, onSave, onSavePixKey }: Props) {
  const [paymentType, setPaymentType] = useState(settings.defaultPaymentType);
  const [footer, setFooter] = useState(settings.invoiceFooterText);
  const [pixKeyValue, setPixKeyValue] = useState(pixKey ?? '');

  function handleSave() {
    onSave({ defaultPaymentType: paymentType, invoiceFooterText: footer });
    if (isPtBR && onSavePixKey) onSavePixKey(pixKeyValue.trim());
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('settings.group.financial')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>{t('settings.financial.paymentType')}</Text>
            <View style={styles.pillRow}>
              {(['private', 'insurance'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.pill, paymentType === type && styles.pillActive]}
                  onPress={() => setPaymentType(type)}
                >
                  <Text style={[styles.pillText, paymentType === type && styles.pillTextActive]}>
                    {type === 'private' ? t('settings.financial.private') : t('settings.financial.insurance')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isPtBR && (
              <>
                <Text style={styles.sectionLabel}>{t('settings.financial.pixKey' as any)}</Text>
                <TextInput
                  style={styles.textInput}
                  value={pixKeyValue}
                  onChangeText={setPixKeyValue}
                  placeholder={t('settings.financial.pixKeyPlaceholder' as any)}
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="default"
                />
              </>
            )}

            <Text style={styles.sectionLabel}>{t('settings.financial.invoiceFooter')}</Text>
            <TextInput
              style={styles.textArea}
              value={footer}
              onChangeText={setFooter}
              multiline
              numberOfLines={4}
              placeholder={t('settings.financial.footerPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              textAlignVertical="top"
            />
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 8,
  },
  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  pill: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pillText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.primary, fontWeight: '700' },
  textInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    padding: 12, height: 46, fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.background, marginBottom: 8,
  },
  textArea: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    padding: 12, minHeight: 90, fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.background, marginBottom: 8,
  },
  saveBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
