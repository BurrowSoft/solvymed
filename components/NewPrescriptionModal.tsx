import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Prescription, PrescriptionItem } from '@/lib/types';
import { createPrescription } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

interface MedEntry extends PrescriptionItem {
  _key: string;
}

function emptyMed(): MedEntry {
  return { _key: Date.now().toString() + Math.random(), name: '', dosage: '', frequency: '', duration: '' };
}

interface Props {
  visible: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onSaved: (prescription: Prescription) => void;
}

export function NewPrescriptionModal({ visible, patientId, patientName, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [medications, setMedications] = useState<MedEntry[]>([emptyMed()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleClose() {
    onClose();
    setMedications([emptyMed()]);
    setNotes('');
    setError('');
  }

  function updateMed(key: string, field: keyof PrescriptionItem, value: string) {
    setMedications(prev => prev.map(m => m._key === key ? { ...m, [field]: value } : m));
  }

  function addMed() {
    setMedications(prev => [...prev, emptyMed()]);
  }

  function removeMed(key: string) {
    setMedications(prev => prev.filter(m => m._key !== key));
  }

  async function handleSave() {
    const filled = medications.filter(m => m.name.trim());
    if (filled.length === 0) { setError(t('rx.errorEmpty')); return; }
    setError('');
    setSaving(true);

    const meds: PrescriptionItem[] = filled.map(({ _key, ...m }) => ({
      name: m.name.trim(),
      dosage: m.dosage.trim(),
      frequency: m.frequency.trim(),
      duration: m.duration.trim(),
    }));

    try {
      if (user) {
        const saved = await createPrescription(patientId, user.id, meds, notes.trim() || undefined);
        onSaved(saved);
      } else {
        onSaved({
          id: Date.now().toString(),
          patientId,
          professionalId: '',
          date: new Date().toISOString().split('T')[0],
          medications: meds,
          notes: notes.trim() || undefined,
        });
      }
      handleClose();
    } catch {
      setError(t('rx.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>{t('rx.title')}</Text>
              <Text style={styles.subtitle}>{patientName}</Text>
            </View>
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
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('rx.medications')}</Text>
                <TouchableOpacity style={styles.addMedBtn} onPress={addMed}>
                  <Ionicons name="add" size={16} color={Colors.primary} />
                  <Text style={styles.addMedText}>{t('common.add')}</Text>
                </TouchableOpacity>
              </View>

              {medications.map((med, index) => (
                <View key={med._key} style={styles.medCard}>
                  <View style={styles.medCardHeader}>
                    <Text style={styles.medIndex}>#{index + 1}</Text>
                    {medications.length > 1 && (
                      <TouchableOpacity onPress={() => removeMed(med._key)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{t('rx.medName')}</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        placeholder={t('rx.medNamePlaceholder')}
                        placeholderTextColor={Colors.textMuted}
                        value={med.name}
                        onChangeText={v => updateMed(med._key, 'name', v)}
                      />
                    </View>
                  </View>

                  <View style={styles.threeCol}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>{t('rx.dosage')}</Text>
                      <View style={styles.inputBox}>
                        <TextInput
                          style={styles.input}
                          placeholder={t('rx.dosagePlaceholder')}
                          placeholderTextColor={Colors.textMuted}
                          value={med.dosage}
                          onChangeText={v => updateMed(med._key, 'dosage', v)}
                        />
                      </View>
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>{t('rx.frequency')}</Text>
                      <View style={styles.inputBox}>
                        <TextInput
                          style={styles.input}
                          placeholder={t('rx.frequencyPlaceholder')}
                          placeholderTextColor={Colors.textMuted}
                          value={med.frequency}
                          onChangeText={v => updateMed(med._key, 'frequency', v)}
                        />
                      </View>
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>{t('rx.duration')}</Text>
                      <View style={styles.inputBox}>
                        <TextInput
                          style={styles.input}
                          placeholder={t('rx.durationPlaceholder')}
                          placeholderTextColor={Colors.textMuted}
                          value={med.duration}
                          onChangeText={v => updateMed(med._key, 'duration', v)}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('rx.notes')} <Text style={styles.optional}>{t('newAppt.optional')}</Text>
              </Text>
              <TextInput
                style={styles.notesInput}
                placeholder={t('rx.notesPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
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
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1 },
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12, marginBottom: -4 },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  optional: { fontWeight: '400', color: Colors.textMuted, textTransform: 'none' },
  addMedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  addMedText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  medCard: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.border },
  medCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medIndex: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  threeCol: { flexDirection: 'row', gap: 8 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 10, height: 38, backgroundColor: Colors.surface,
  },
  input: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  notesInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: Colors.textPrimary, minHeight: 88, backgroundColor: Colors.background,
  },
});
