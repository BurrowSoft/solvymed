import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { getProfessionalForPatient, getAppointmentsByDate, createAppointment } from '@/lib/services';
import { Professional, WorkingHours, WorkingHoursKey } from '@/lib/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}

const SLOT_MINUTES = 30;
const DAYS_AHEAD = 30;
const DAY_KEYS: WorkingHoursKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function buildDateStrip(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function isWorkingDay(dateStr: string, workingHours?: WorkingHours): boolean {
  if (!workingHours) return true;
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  const key = DAY_KEYS[dow];
  return !!(workingHours[key]?.enabled);
}

function generateSlots(workingHours: WorkingHours | undefined, dateStr: string, bookedSlots: { start: string; end: string }[]): string[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  const key = DAY_KEYS[dow];
  const dayConfig = workingHours?.[key];
  if (!dayConfig?.enabled) return [];

  const slots: string[] = [];
  let cur = dayConfig.start ?? '08:00';
  const end = dayConfig.end ?? '18:00';

  while (timeToMins(cur) + SLOT_MINUTES <= timeToMins(end)) {
    const slotEnd = addMinutes(cur, SLOT_MINUTES);
    const slotStartMins = timeToMins(cur);
    const slotEndMins = timeToMins(slotEnd);

    const isBooked = bookedSlots.some(b => {
      const bs = timeToMins(b.start);
      const be = timeToMins(b.end);
      return slotStartMins < be && slotEndMins > bs;
    });

    if (!isBooked) slots.push(cur);
    cur = slotEnd;
  }
  return slots;
}

export function BookAppointmentModal({ visible, onClose, patientId, patientName }: Props) {
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [loadingPro, setLoadingPro] = useState(true);
  const [allDates] = useState(() => buildDateStrip());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [consultType, setConsultType] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setProfessional(null);
    setLoadingPro(true);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setConsultType('');
    setNotes('');

    getProfessionalForPatient(patientId)
      .then(setProfessional)
      .catch(() => {})
      .finally(() => setLoadingPro(false));
  }, [visible, patientId]);

  const loadSlots = useCallback(async (date: string) => {
    if (!professional) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const appts = await getAppointmentsByDate(professional.id, date);
      const booked = appts
        .filter(a => a.status !== 'cancelled')
        .map(a => ({ start: a.startTime, end: a.endTime }));
      setSlots(generateSlots(professional.workingHours, date, booked));
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [professional]);

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    loadSlots(date);
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedSlot || !professional) return;
    setSaving(true);
    try {
      const endTime = addMinutes(selectedSlot, SLOT_MINUTES);
      await createAppointment({
        patientId,
        patientName,
        professionalId: professional.id,
        date: selectedDate,
        startTime: selectedSlot,
        endTime,
        durationMinutes: SLOT_MINUTES,
        type: 'in-person',
        consultationType: consultType.trim() || 'Consultation',
        paymentType: 'private',
        paymentStatus: 'pending',
        status: 'scheduled',
        notes: notes.trim() || undefined,
        scheduledBy: 'patient',
      });
      Alert.alert('', t('book.success'));
      onClose();
    } catch {
      Alert.alert('', t('patients.form.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const workingDates = allDates.filter(d => professional ? isWorkingDay(d, professional.workingHours) : true);

  function formatDateLabel(dateStr: string): { weekday: string; day: string; month: string } {
    const d = new Date(dateStr + 'T12:00:00');
    return {
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(d.getDate()),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
    };
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('book.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {loadingPro ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>{t('book.loading')}</Text>
          </View>
        ) : !professional ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('patient.noLink')}</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Date strip */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('book.selectDate')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
                {workingDates.map(date => {
                  const { weekday, day, month } = formatDateLabel(date);
                  const isSelected = selectedDate === date;
                  return (
                    <TouchableOpacity
                      key={date}
                      style={[styles.datePill, isSelected && styles.datePillActive]}
                      onPress={() => handleSelectDate(date)}
                    >
                      <Text style={[styles.datePillWeekday, isSelected && styles.datePillTextActive]}>{weekday}</Text>
                      <Text style={[styles.datePillDay, isSelected && styles.datePillTextActive]}>{day}</Text>
                      <Text style={[styles.datePillMonth, isSelected && styles.datePillTextActive]}>{month}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Time slots */}
            {selectedDate && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('book.selectTime')}</Text>
                {loadingSlots ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
                ) : slots.length === 0 ? (
                  <Text style={styles.noSlots}>{t('book.noSlots')}</Text>
                ) : (
                  <View style={styles.slotGrid}>
                    {slots.map(slot => (
                      <TouchableOpacity
                        key={slot}
                        style={[styles.slotPill, selectedSlot === slot && styles.slotPillActive]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <Text style={[styles.slotText, selectedSlot === slot && styles.slotTextActive]}>{slot}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Consultation type + notes */}
            {selectedSlot && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('book.type')}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('book.typePlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={consultType}
                    onChangeText={setConsultType}
                  />
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('book.notes')}</Text>
                <View style={[styles.inputBox, { height: 80, alignItems: 'flex-start', paddingVertical: 10 }]}>
                  <TextInput
                    style={[styles.input, { textAlignVertical: 'top' }]}
                    placeholder={t('newAppt.notesPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
                  onPress={handleConfirm}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.confirmBtnText}>{t('book.confirm')}</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, color: Colors.textMuted, marginTop: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  dateStrip: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  datePill: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background, minWidth: 56,
  },
  datePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  datePillWeekday: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  datePillDay: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  datePillMonth: { fontSize: 10, color: Colors.textMuted },
  datePillTextActive: { color: '#fff' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotPill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  slotPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  slotTextActive: { color: '#fff' },
  noSlots: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background,
  },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  confirmBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 24,
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
