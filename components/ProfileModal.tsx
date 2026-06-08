import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Professional } from '@/lib/types';
import { getProfessional, upsertProfessional } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

const SPECIALTIES = [
  'General Practitioner', 'Cardiologist', 'Dermatologist', 'Orthopedist',
  'Pediatrician', 'Psychiatrist', 'Neurologist', 'Gynecologist',
  'Endocrinologist', 'Ophthalmologist',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (professional: Professional) => void;
}

export function ProfileModal({ visible, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    getProfessional(user.id)
      .then(prof => {
        if (prof) {
          setFullName(prof.fullName);
          setSpecialty(prof.specialty ?? '');
          setClinicName(prof.clinicName ?? '');
        } else {
          setFullName('');
          setSpecialty('');
          setClinicName('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, user]);

  async function handleSave() {
    if (!fullName.trim()) { setError('Name is required'); return; }
    if (!user) return;
    setError('');
    setSaving(true);
    try {
      const saved = await upsertProfessional(user.id, user.email ?? '', {
        fullName: fullName.trim(),
        specialty: specialty.trim() || undefined,
        clinicName: clinicName.trim() || undefined,
      });
      onSaved(saved);
      onClose();
    } catch {
      setError('Failed to save profile. Please try again.');
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
            <Text style={styles.title}>My Profile</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving || loading}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {/* Avatar */}
              <View style={styles.avatarSection}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>
                    {fullName ? fullName[0].toUpperCase() : '?'}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Professional Information</Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Full Name <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="Dr. Your Name"
                      placeholderTextColor={Colors.textMuted}
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={[styles.inputBox, styles.readOnly]}>
                    <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                    <Text style={[styles.input, { color: Colors.textSecondary }]}>{user?.email}</Text>
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.textMuted} />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Specialty</Text>
                  <TouchableOpacity
                    style={styles.inputBox}
                    onPress={() => setShowSpecialtyPicker(!showSpecialtyPicker)}
                  >
                    <Ionicons name="medkit-outline" size={16} color={Colors.textMuted} />
                    <Text style={[styles.input, !specialty && { color: Colors.textMuted }]}>
                      {specialty || 'Select specialty...'}
                    </Text>
                    <Ionicons name={showSpecialtyPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showSpecialtyPicker && (
                    <View style={styles.picker}>
                      {SPECIALTIES.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.pickerItem, specialty === s && styles.pickerItemActive]}
                          onPress={() => { setSpecialty(s); setShowSpecialtyPicker(false); }}
                        >
                          <Text style={[styles.pickerItemText, specialty === s && styles.pickerItemTextActive]}>{s}</Text>
                          {specialty === s && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.pickerItem}
                        onPress={() => { setSpecialty(''); setShowSpecialtyPicker(false); }}
                      >
                        <Text style={styles.pickerItemText}>Other / Not listed</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!showSpecialtyPicker && (
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        placeholder="Or type your specialty..."
                        placeholderTextColor={Colors.textMuted}
                        value={specialty}
                        onChangeText={setSpecialty}
                      />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Clinic</Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Clinic / Practice Name</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Minha Clínica"
                      placeholderTextColor={Colors.textMuted}
                      value={clinicName}
                      onChangeText={setClinicName}
                    />
                  </View>
                </View>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
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
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12 },
  avatarSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: Colors.surface },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: Colors.primary },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  required: { color: Colors.danger },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background,
  },
  readOnly: { backgroundColor: Colors.background, opacity: 0.7 },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  picker: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.surface, overflow: 'hidden', marginTop: -4 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerItemActive: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: 14, color: Colors.textPrimary },
  pickerItemTextActive: { color: Colors.primary, fontWeight: '600' },
});
