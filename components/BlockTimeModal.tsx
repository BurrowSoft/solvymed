import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { createAppointment } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

const TIME_SLOTS: string[] = [];
for (let h = 7; h < 21; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const REASON_PRESETS = ['Lunch break', 'Meeting', 'Personal', 'Off duty', 'Vacation', 'Training'];

interface Props {
  visible: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}

export function BlockTimeModal({ visible, defaultDate, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  function resetForm() {
    setDate(defaultDate);
    setStartTime('09:00');
    setDuration(60);
    setReason('');
    setError('');
  }

  function durationLabel(min: number) {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem ? `${h}h${rem}m` : `${h}h`;
  }

  async function handleSave() {
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) { setError('Date must be YYYY-MM-DD'); return; }
    setError('');
    setSaving(true);

    const apptData: Omit<Appointment, 'id'> = {
      patientId: '',
      patientName: '',
      date,
      startTime,
      endTime,
      durationMinutes: duration,
      type: 'in-person',
      consultationType: reason.trim() || 'Blocked',
      paymentType: 'private',
      paymentStatus: 'pending',
      status: 'blocked',
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
      setError('Failed to save. Please try again.');
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
            <Text style={styles.title}>Block Time</Text>
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
                    <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>
                      {durationLabel(d)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>
                Ends at: <Text style={styles.endTime}>{endTime}</Text>
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Reason <Text style={styles.optional}>(optional)</Text>
              </Text>

              <View style={styles.presets}>
                {REASON_PRESETS.map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setReason(reason === r ? '' : r)}
                    style={[styles.preset, reason === r && styles.presetActive]}
                  >
                    <Text style={[styles.presetText, reason === r && styles.presetTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Or type a custom reason..."
                  placeholderTextColor={Colors.textMuted}
                  value={reason}
                  onChangeText={setReason}
                />
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
  saveBtn: { backgroundColor: Colors.blocked, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  body: { flex: 1 },
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12, marginBottom: -4 },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  optional: { fontWeight: '400', color: Colors.textMuted, textTransform: 'none' },
  endTime: { fontWeight: '700', color: Colors.textPrimary },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  timeSlotsRow: { maxHeight: 44 },
  timeSlot: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  timeSlotActive: { backgroundColor: Colors.blocked, borderColor: Colors.blocked },
  timeSlotText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  timeSlotTextActive: { color: Colors.textPrimary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  pillActive: { backgroundColor: Colors.blocked, borderColor: Colors.blocked },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  presetActive: { backgroundColor: Colors.blockedBg, borderColor: Colors.blocked },
  presetText: { fontSize: 13, color: Colors.textSecondary },
  presetTextActive: { color: Colors.textPrimary, fontWeight: '600' },
});
