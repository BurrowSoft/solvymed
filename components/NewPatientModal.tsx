import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Patient } from '@/lib/types';
import { createPatient } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';
import { formatAge } from '@/lib/locale-utils';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}

export function NewPatientModal({ visible, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other' | undefined>();
  const [birthDate, setBirthDate] = useState('');
  const [profession, setProfession] = useState('');
  const [countryCode, setCountryCode] = useState('+55');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const COUNTRY_CODES = [
    { code: '+55', label: 'BR +55' },
    { code: '+1', label: 'US +1' },
    { code: '+351', label: 'PT +351' },
    { code: '+44', label: 'UK +44' },
    { code: '+34', label: 'ES +34' },
    { code: '+49', label: 'DE +49' },
    { code: '+33', label: 'FR +33' },
    { code: '+39', label: 'IT +39' },
    { code: '+54', label: 'AR +54' },
  ];

  const agePreview = useMemo(() => {
    if (!birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) return '';
    return formatAge(birthDate);
  }, [birthDate]);

  function resetForm() {
    setFullName(''); setPhone(''); setEmail(''); setCpf('');
    setSex(undefined); setBirthDate(''); setProfession('');
    setCountryCode('+55'); setError('');
  }

  async function handleSave() {
    if (!fullName.trim()) { setError(t('patients.form.fullNameRequired')); return; }
    setError('');
    setSaving(true);

    const patientData = {
      fullName: fullName.trim(),
      phone: phone.trim() ? `${countryCode}${phone.trim()}` : undefined,
      email: email.trim() || undefined,
      cpf: cpf.trim() || undefined,
      sex,
      birthDate: birthDate.trim() || undefined,
      profession: profession.trim() || undefined,
    };

    try {
      if (user) {
        const saved = await createPatient(patientData, user.id);
        onSaved(saved);
      } else {
        onSaved({ ...patientData, id: Date.now().toString(), createdAt: new Date().toISOString() });
      }
      onClose();
      resetForm();
    } catch {
      setError(t('patients.form.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { onClose(); resetForm(); }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { onClose(); resetForm(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('patients.form.title.new')}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('patients.form.section.personal')}</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.fullName')} <Text style={styles.required}>*</Text></Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('patients.form.fullNamePlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.cpf')}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('patients.form.cpfPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={cpf}
                    onChangeText={setCpf}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.sex')}</Text>
                <View style={styles.pills}>
                  {(['male', 'female', 'other'] as const).map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setSex(sex === s ? undefined : s)}
                      style={[styles.pill, sex === s && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, sex === s && styles.pillTextActive]}>
                        {t(`patients.form.${s}` as any)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('patients.form.dob')}</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder={t('patients.form.dobPlaceholder')}
                      placeholderTextColor={Colors.textMuted}
                      value={birthDate}
                      onChangeText={setBirthDate}
                    />
                  </View>
                  {!!agePreview && (
                    <Text style={styles.agePreview}>{agePreview}</Text>
                  )}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.profession')}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('patients.form.professionPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={profession}
                    onChangeText={setProfession}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('patients.form.section.contact')}</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.phone')}</Text>
                <View style={styles.inputBox}>
                  <TouchableOpacity
                    onPress={() => setShowCountryPicker(true)}
                    style={styles.countryCodeBtn}
                  >
                    <Text style={styles.countryCodeText}>{countryCode}</Text>
                    <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <View style={styles.countryDivider} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('patients.form.phonePlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('patients.form.email')}</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder={t('patients.form.emailPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Country code picker */}
      <Modal visible={showCountryPicker} transparent animationType="fade" onRequestClose={() => setShowCountryPicker(false)}>
        <TouchableOpacity style={styles.countryOverlay} activeOpacity={1} onPress={() => setShowCountryPicker(false)}>
          <View style={styles.countrySheet}>
            <Text style={styles.countrySheetTitle}>{t('patients.form.selectCountry')}</Text>
            {COUNTRY_CODES.map(({ code, label }) => (
              <TouchableOpacity
                key={code}
                style={[styles.countryOption, countryCode === code && styles.countryOptionActive]}
                onPress={() => { setCountryCode(code); setShowCountryPicker(false); }}
              >
                <Text style={[styles.countryOptionText, countryCode === code && { color: Colors.primary, fontWeight: '700' }]}>{label}</Text>
                {countryCode === code && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12, marginBottom: -4 },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  required: { color: Colors.danger },
  row: { flexDirection: 'row', gap: 12 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background,
  },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: '#fff' },
  agePreview: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 4, marginLeft: 2 },
  countryCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  countryCodeText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  countryDivider: { width: 1, height: 20, backgroundColor: Colors.border, marginHorizontal: 4 },
  countryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  countrySheet: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, width: 260, gap: 4 },
  countrySheetTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  countryOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  countryOptionActive: { backgroundColor: Colors.primaryLight },
  countryOptionText: { fontSize: 14, color: Colors.textPrimary },
});
