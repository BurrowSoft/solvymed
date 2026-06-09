import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment, AppointmentExtraItem, Patient, Procedure } from '@/lib/types';
import { createAppointment, updateAppointment, createRecurringAppointments, getPatients, getProcedures } from '@/lib/services';
import { scheduleAppointmentReminder } from '@/lib/notifications';
import { MOCK_PATIENTS } from '@/lib/mock-data';
import { useAuth } from '@/lib/auth-context';

const TIME_SLOTS: string[] = [];
for (let h = 7; h < 21; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const DURATIONS = [15, 20, 30, 45, 50, 60, 90];
const FALLBACK_TYPES = ['Consultation', 'Follow-up', 'Exam Review', 'Procedure', 'Emergency'];

type RecurrenceMode = 'none' | 'weekly' | 'biweekly' | 'monthly';

const RECURRENCE_OPTIONS: { key: RecurrenceMode; label: string }[] = [
  { key: 'none', label: 'No repeat' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'monthly', label: 'Monthly' },
];

interface Props {
  visible: boolean;
  defaultDate: string;
  editAppt?: Appointment;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
  onUpdated?: (appt: Appointment) => void;
}

export function NewAppointmentModal({
  visible, defaultDate, editAppt, onClose, onSaved, onUpdated,
}: Props) {
  const { user } = useAuth();
  const isEdit = !!editAppt;

  // Procedures
  const [procedures, setProcedures] = useState<Procedure[]>([]);

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

  // Recurrence (create mode only)
  const [recurrence, setRecurrence] = useState<RecurrenceMode>('none');
  const [occurrences, setOccurrences] = useState('8');

  const [extraItems, setExtraItems] = useState<AppointmentExtraItem[]>([]);
  const [extraItemName, setExtraItemName] = useState('');
  const [extraItemPrice, setExtraItemPrice] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!visible) return;
    if (editAppt) {
      setPatientId(editAppt.patientId ?? '');
      setPatientName(editAppt.patientName ?? '');
      setPatientSearch('');
      setDate(editAppt.date);
      setStartTime(editAppt.startTime);
      setDuration(editAppt.durationMinutes);
      setType(editAppt.type);
      setConsultationType(editAppt.consultationType);
      setPaymentType(editAppt.paymentType);
      setAmount(editAppt.paymentAmount?.toString() ?? '');
      setNotes(editAppt.notes ?? '');
      setExtraItems(editAppt.extraItems ?? []);
      setRecurrence('none');
    } else {
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
      setExtraItems([]);
      setRecurrence('none');
      setOccurrences('8');
    }
    setExtraItemName('');
    setExtraItemPrice('');
    setError('');
    if (user) {
      getPatients(user.id).then(setPatients).catch(() => setPatients(MOCK_PATIENTS));
      getProcedures(user.id).then(p => setProcedures(p.filter(x => x.active))).catch(() => {});
    } else {
      setPatients(MOCK_PATIENTS);
      setProcedures([]);
    }
  }, [visible, user, defaultDate, editAppt?.id]);

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
      paymentStatus: editAppt?.paymentStatus ?? 'pending',
      status: editAppt?.status ?? 'scheduled',
      notes: notes.trim() || undefined,
      extraItems: extraItems.length > 0 ? extraItems : undefined,
      professionalId: user?.id ?? '',
    };

    try {
      if (isEdit && editAppt) {
        if (user) await updateAppointment(editAppt.id, apptData);
        onUpdated?.({ ...apptData, id: editAppt.id });
        onClose();
      } else if (!isEdit && recurrence !== 'none') {
        const count = Math.max(1, parseInt(occurrences, 10) || 8);
        if (user) {
          const all = await createRecurringAppointments(apptData, recurrence, count);
          for (const a of all) scheduleAppointmentReminder(a).catch(() => {});
          onSaved(all[0]);
        } else {
          onSaved({ ...apptData, id: Date.now().toString() });
        }
        onClose();
      } else {
        if (user) {
          const saved = await createAppointment(apptData);
          scheduleAppointmentReminder(saved).catch(() => {});
          onSaved(saved);
        } else {
          onSaved({ ...apptData, id: Date.now().toString() });
        }
        onClose();
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const saveBtnLabel = isEdit
    ? 'Update'
    : recurrence !== 'none'
    ? `Save ×${parseInt(occurrences, 10) || 8}`
    : 'Save';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.title}>{isEdit ? 'Edit Appointment' : 'New Appointment'}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>{saveBtnLabel}</Text>
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
              {procedures.length > 0 ? (
                <>
                  <View style={styles.procedureList}>
                    {procedures.map((p, i) => {
                      const selected = consultationType === p.name;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.procedureRow, selected && styles.procedureRowActive, i < procedures.length - 1 && styles.procedureRowBorder]}
                          onPress={() => {
                            setConsultationType(p.name);
                            setDuration(p.durationMinutes);
                            if (p.price != null) setAmount(p.price.toString());
                            setPaymentType(p.paymentType);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.procName, selected && styles.procNameActive]}>{p.name}</Text>
                            <Text style={[styles.procMeta, selected && styles.procMetaActive]}>
                              {p.durationMinutes} min{p.price != null ? ` · R$ ${p.price.toFixed(2)}` : ''}
                            </Text>
                          </View>
                          {selected && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {!procedures.some(p => p.name === consultationType) && consultationType && (
                    <View style={[styles.pill, styles.pillActive, { alignSelf: 'flex-start', marginTop: 6 }]}>
                      <Text style={styles.pillTextActive}>{consultationType}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.pills}>
                    {FALLBACK_TYPES.map(ct => (
                      <TouchableOpacity
                        key={ct}
                        onPress={() => setConsultationType(ct)}
                        style={[styles.pill, consultationType === ct && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, consultationType === ct && styles.pillTextActive]}>{ct}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.procHint}>Configure your procedures in Settings → My Procedures for quicker booking.</Text>
                </>
              )}
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

            {/* ── Additional Items ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Additional Items <Text style={styles.optional}>(optional)</Text>
              </Text>

              {extraItems.map((item, i) => (
                <View key={i} style={styles.extraItemRow}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.extraItemName}>{item.name}</Text>
                    {item.price != null && (
                      <Text style={styles.extraItemPrice}>R$ {item.price.toFixed(2)}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setExtraItems(prev => prev.filter((_, j) => j !== i))}>
                    <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.extraAddRow}>
                <View style={[styles.inputBox, { flex: 2 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Item name"
                    placeholderTextColor={Colors.textMuted}
                    value={extraItemName}
                    onChangeText={setExtraItemName}
                  />
                </View>
                <View style={[styles.inputBox, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="R$ 0.00"
                    placeholderTextColor={Colors.textMuted}
                    value={extraItemPrice}
                    onChangeText={setExtraItemPrice}
                    keyboardType="decimal-pad"
                  />
                </View>
                <TouchableOpacity
                  style={styles.extraAddBtn}
                  onPress={() => {
                    const name = extraItemName.trim();
                    if (!name) return;
                    const price = extraItemPrice ? parseFloat(extraItemPrice) : undefined;
                    setExtraItems(prev => [...prev, { name, price: isNaN(price!) ? undefined : price }]);
                    setExtraItemName('');
                    setExtraItemPrice('');
                  }}
                >
                  <Ionicons name="add" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Recurrence (create mode only) ── */}
            {!isEdit && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recurrence</Text>
                <View style={styles.pills}>
                  {RECURRENCE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setRecurrence(opt.key)}
                      style={[styles.pill, recurrence === opt.key && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, recurrence === opt.key && styles.pillTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {recurrence !== 'none' && (
                  <View style={styles.occurrencesRow}>
                    <Text style={styles.fieldLabel}>Number of appointments</Text>
                    <View style={styles.occurrencesInput}>
                      <TouchableOpacity
                        onPress={() => setOccurrences(v => String(Math.max(2, (parseInt(v, 10) || 8) - 1)))}
                        style={styles.occurrenceBtn}
                      >
                        <Ionicons name="remove" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <Text style={styles.occurrenceCount}>{parseInt(occurrences, 10) || 8}</Text>
                      <TouchableOpacity
                        onPress={() => setOccurrences(v => String(Math.min(52, (parseInt(v, 10) || 8) + 1)))}
                        style={styles.occurrenceBtn}
                      >
                        <Ionicons name="add" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

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

  // Procedure picker
  procedureList: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, overflow: 'hidden' },
  procedureRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.background, gap: 10 },
  procedureRowActive: { backgroundColor: Colors.primaryLight },
  procedureRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  procName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  procNameActive: { color: Colors.primaryDark },
  procMeta: { fontSize: 11, color: Colors.textSecondary },
  procMetaActive: { color: Colors.primary },
  procHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  // Extra items
  extraItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  extraItemName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  extraItemPrice: { fontSize: 11, color: Colors.textSecondary },
  extraAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  extraAddBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },

  // Recurrence
  occurrencesRow: { gap: 8 },
  occurrencesInput: { flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'flex-start', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 4 },
  occurrenceBtn: { padding: 10 },
  occurrenceCount: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, minWidth: 32, textAlign: 'center' },
});
