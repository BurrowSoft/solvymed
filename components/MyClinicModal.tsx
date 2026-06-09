import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Professional } from '@/lib/types';
import { updateProfessional } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

interface Props {
  visible: boolean;
  professional: Professional | null;
  onClose: () => void;
  onSaved: (updated: Professional) => void;
}

export function MyClinicModal({ visible, professional, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [clinicName, setClinicName] = useState('');
  const [clinicCnpj, setClinicCnpj] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicCity, setClinicCity] = useState('');
  const [clinicState, setClinicState] = useState('');
  const [clinicWebsite, setClinicWebsite] = useState('');

  useEffect(() => {
    if (!visible) return;
    setClinicName(professional?.clinicName ?? '');
    setClinicCnpj(professional?.clinicCnpj ?? '');
    setClinicPhone(professional?.clinicPhone ?? '');
    setClinicAddress(professional?.clinicAddress ?? '');
    setClinicCity(professional?.clinicCity ?? '');
    setClinicState(professional?.clinicState ?? '');
    setClinicWebsite(professional?.clinicWebsite ?? '');
  }, [visible, professional]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const updates: Partial<Professional> = {
      clinicName: clinicName.trim() || undefined,
      clinicCnpj: clinicCnpj.trim() || undefined,
      clinicPhone: clinicPhone.trim() || undefined,
      clinicAddress: clinicAddress.trim() || undefined,
      clinicCity: clinicCity.trim() || undefined,
      clinicState: clinicState.trim() || undefined,
      clinicWebsite: clinicWebsite.trim() || undefined,
    };
    try {
      await updateProfessional(user.id, updates);
      onSaved({ ...(professional ?? { id: user.id, fullName: '', email: '' }), ...updates });
      onClose();
    } catch {
      // stay open on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('clinic.title')}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('clinic.infoSection')}</Text>

              <Text style={styles.label}>{t('clinic.name')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. SolvyMed Clinic"
                  placeholderTextColor={Colors.textMuted}
                  value={clinicName}
                  onChangeText={setClinicName}
                />
              </View>

              <Text style={styles.label}>{t('clinic.cnpj')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="00.000.000/0000-00"
                  placeholderTextColor={Colors.textMuted}
                  value={clinicCnpj}
                  onChangeText={setClinicCnpj}
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.label}>{t('clinic.phone')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="+55 (11) 99999-9999"
                  placeholderTextColor={Colors.textMuted}
                  value={clinicPhone}
                  onChangeText={setClinicPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.label}>{t('clinic.website')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="https://yourclinic.com.br"
                  placeholderTextColor={Colors.textMuted}
                  value={clinicWebsite}
                  onChangeText={setClinicWebsite}
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('clinic.addressSection')}</Text>

              <Text style={styles.label}>{t('clinic.address')}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Av. Paulista, 1000 — Sala 42"
                  placeholderTextColor={Colors.textMuted}
                  value={clinicAddress}
                  onChangeText={setClinicAddress}
                />
              </View>

              <View style={styles.row}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>{t('clinic.city')}</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="São Paulo"
                      placeholderTextColor={Colors.textMuted}
                      value={clinicCity}
                      onChangeText={setClinicCity}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('clinic.state')}</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="SP"
                      placeholderTextColor={Colors.textMuted}
                      value={clinicState}
                      onChangeText={v => setClinicState(v.toUpperCase().slice(0, 2))}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1 },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', marginTop: 6 },
  inputBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, backgroundColor: Colors.background, justifyContent: 'center' },
  input: { fontSize: 14, color: Colors.textPrimary },
  row: { flexDirection: 'row', gap: 10 },
});
