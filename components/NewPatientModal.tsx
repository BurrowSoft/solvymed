import React, { useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setFullName(''); setPhone(''); setEmail(''); setCpf('');
    setSex(undefined); setBirthDate(''); setProfession(''); setError('');
  }

  async function handleSave() {
    if (!fullName.trim()) { setError('Full name is required'); return; }
    setError('');
    setSaving(true);

    const patientData = {
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
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
      setError('Failed to save patient. Please try again.');
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
            <Text style={styles.title}>New Patient</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Information</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full Name <Text style={styles.required}>*</Text></Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor={Colors.textMuted}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CPF</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="000.000.000-00"
                    placeholderTextColor={Colors.textMuted}
                    value={cpf}
                    onChangeText={setCpf}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Sex</Text>
                <View style={styles.pills}>
                  {(['male', 'female', 'other'] as const).map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setSex(sex === s ? undefined : s)}
                      style={[styles.pill, sex === s && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, sex === s && styles.pillTextActive]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.textMuted}
                      value={birthDate}
                      onChangeText={setBirthDate}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Profession</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Engineer, Teacher..."
                    placeholderTextColor={Colors.textMuted}
                    value={profession}
                    onChangeText={setProfession}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Contact</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="+55 (11) 99999-9999"
                    placeholderTextColor={Colors.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
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
});
