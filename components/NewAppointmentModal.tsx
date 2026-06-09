import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment, Patient } from '@/lib/types';
import { createAppointment, getPatients } from '@/lib/services';
import { MOCK_PATIENTS } from '@/lib/mock-data';
import { useAuth } from '@/lib/auth-context';

const TIME_SLOTS: string[] = [];
for (let h = 7; h < 21; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const DURATIONS = [15, 30, 45, 60, 90];
const CONSULTATION_TYPES = ['Consultation', 'Follow-up', 'Exam Review', 'Procedure', 'Emergency'];

interface Props {
  visible: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}

export function NewAppointmentModal({ visible, defaultDate, onClose, onSaved }: Props) {
  const { user } = useAuth();

  // Patient picker
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientSearch, setPatientSearch] = useState('');

  // Appointment fields
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState<'in-person' | 'online'>('in-person');
  const [consultationType, setConsultationType] = useState('Consultation');
  const [paymentType, setPaymentType] = useState<'private' | 'insurance'>('private');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!visible) return;
    setDate(defaultDate);
    if (user) {
      getPatients(user.id).then(setPatients).catch(() => setPatients(MOCK_PATIENTS));
    } else {
      setPatients(MOCK_PATIENTS);
    }
  }, [visible, user, defaultDate]);

  const filteredPatients = patientSearch
    ? patients.filter(p => p.fullName.toLowerCase().includes(patientSearch.toLowerCase()))
    : patients.slice(0, 6);

  function selectPatient(p: Patient) {
    setPatientId(p.id);
    setPatientName(p.fullName);
    setPatientSearch('');
  }

  function clearPatient() {
    setPatientId('');
    setPatientName('');
    setPatientSearch('');
  }

  function resetForm() {
    setPatientId('');
    setPatientName('');
    setPatientSearch('');
    setDate(defaultDate);
    setStartTime('09:00');
    setDuration(30);
    setType('in-person');
    setConsultationType('Consultation');
    setPaymentType('private');
    setAmount('');
    setNotes('');
    setError('');
  }

  async function handleSave() {
    if (!patientName.trim()) { setError('Select or enter a patient name'); return; }
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) { setError('Date must be YYYY-MM-DD'); return; }
    setError('');
    setSaving(true);

    const apptData: Omit<Appointment, 'id'> = {
      patientId: patientId || '',
      patientName: patientName.trim(),
      date,
      startTime,
      endTime,
      durationMinutes: duration,
      type,
      consultationType,
      paymentType,
      paymentAmount: amount ? parseFloat(amount) : undefined,
      paymentStatus: 'pending',
      status: 'scheduled',
      notes: notes.trim() || undefined,
      professionalId: user?.id ?? '',
    };

    try {
      if (user) {
        const saved = await createAppointment(apptData);
        onSaved(saved);
      } else {
        onSaved({ ...apptData, id: Date.now().toString() });
      }
      onClose();
      resetForm();
    } catch {
      setError('Failed to save appointment. Please try again.');
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
            <Text style={styles.title}>New Appointment</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            {/* ── Patient ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Patient</Text>
              {patientId ? (
                <View style={styles.selectedRow}>
                  <View style={styles.selectedAvatar}>
                    <Text style={styles.selectedInitial}>{patientName[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.selectedName} numberOfLines={1}>{patientName}</Text>
                  <TouchableOpacity onPress={clearPatient}>
                    <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.inputBox}>
                    <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="Search or type patient name..."
                      placeholderTextColor={Colors.textMuted}
                      value={patientSearch || patientName}
                      onChangeText={v => { setPatientSearch(v); setPatientName(v); }}
                    />
                    {(patientSearch || patientName) ? (
                      <TouchableOpacity onPress={clearPatient}>
                        <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {filteredPatients.length > 0 && (
                    <View style={styles.pickerList}>
                      {filteredPatients.map((p, i) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.pickerItem, i < filteredPatients.length - 1 && styles.pickerItemBorder]}
                          onPress={() => selectPatient(p)}
                        >
                          <View style={styles.pickerAvatar}>
                            <Text style={styles.pickerInitial}>{p.fullName[0]?.toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.pickerName}>{p.fullName}</Text>
                            {p.phone ? <Text style={styles.pickerPhone}>{p.phone}</Text> : null}
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── Date & Time ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date & Time</Text>

              <View style={styles.inputBox}>
                <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                  value={date}
                  onChangeText={setDate}
                />
              </View>

              <Text style={styles.fieldLabel}>Start time</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.timeSlotsRow}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 2, paddingVertical: 4 }}
              >
                {TIME_SLOTS.map(slot => (
                  <TouchableOpacity
                    key={slot}
                    onPress={() => setStartTime(slot)}
                    style={[styles.timeSlot, startTime === slot && styles.timeSlotActive]}
                  >
                    <Text style={[styles.timeSlotText, startTime === slot && styles.timeSlotTextActive]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.pills}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setDuration(d)}
                    style={[styles.pill, duration === d && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>{d} min</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>
                Ends at: <Text style={styles.endTime}>{endTime}</Text>
              </Text>
            </View>

            {/* ── Details ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Details</Text>

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.toggle}>
                <TouchableOpacity
                  style={[styles.toggleOpt, type === 'in-person' && styles.toggleOptActive]}
                  onPress={() => setType('in-person')}
                >
                  <Ionicons name="business-outline" size={14} color={type === 'in-person' ? '#fff' : Colors.textSecondary} />
                  <Text style={[styles.toggleOptText, type === 'in-person' && styles.toggleOptTextActive]}>In-Person</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleOpt, type === 'online' && styles.toggleOptActive]}
                  onPress={() => setType('online')}
                >
                  <Ionicons name="videocam-outline" size={14} color={type === 'online' ? '#fff' : Colors.textSecondary} />
                  <Text style={[styles.toggleOptText, type === 'online' && styles.toggleOptTextActive]}>Online</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Consultation type</Text>
              <View style={styles.pills}>
                {CONSULTATION_TYPES.map(ct => (
                  <TouchableOpacity
                    key={ct}
                    onPress={() => setConsultationType(ct)}
                    style={[styles.pill, consultationType === ct && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, consultationType === ct && styles.pillTextActive]}>{ct}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Payment ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment</Text>

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.toggle}>
                <TouchableOpacity
                  style={[styles.toggleOpt, paymentType === 'private' && styles.toggleOptActive]}
                  onPress={() => setPaymentType('private')}
                >
                  <Text style={[styles.toggleOptText, paymentType === 'private' && styles.toggleOptTextActive]}>Private</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleOpt, paymentType === 'insurance' && styles.toggleOptActive]}
                  onPress={() => setPaymentType('insurance')}
                >
                  <Text style={[styles.toggleOptText, paymentType === 'insurance' && styles.toggleOptTextActive]}>Insurance</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Amount (R$)</Text>
              <View style={styles.inputBox}>
                <Text style={styles.currencyPrefix}>R$</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* ── Notes ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Notes <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Add notes about this appointment..."
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
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1 },
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12, marginBottom: -4 },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  optional: { fontWeight: '400', color: Colors.textMuted, textTransform: 'none' },
  endTime: { fontWeight: '700', color: Colors.textPrimary },

  // Patient picker
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 10 },
  selectedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  selectedInitial: { fontSize: 15, fontWeight: '700', color: '#fff' },
  selectedName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primaryDark },
  pickerList: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.surface, overflow: 'hidden' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  pickerItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  pickerInitial: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  pickerName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  pickerPhone: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background,
  },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  currencyPrefix: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  timeSlotsRow: { maxHeight: 44 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  timeSlotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timeSlotText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  timeSlotTextActive: { color: '#fff' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: '#fff' },
  toggle: { flexDirection: 'row', gap: 8 },
  toggleOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  toggleOptActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleOptText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  toggleOptTextActive: { color: '#fff' },
  notesInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.textPrimary, minHeight: 88, backgroundColor: Colors.background },
});
