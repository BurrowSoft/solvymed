import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { TimeSlot, getAvailableSlots, createTentativeBooking } from '@/lib/booking-service';
import { getProfessionalProcedures, ProcedureSummary } from '@/lib/discovery-service';
import { useAuth } from '@/lib/auth-context';
import { useStyles } from '@/lib/use-styles';

const FALLBACK_DURATIONS = [30, 45, 60];
const DAYS_AHEAD = 14;

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function buildDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(fmt(d));
  }
  return days;
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = fmt(new Date());
  if (dateStr === today) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BookScreen() {
  const styles = useStyles(makeStyles);
  const { professionalId, professionalName, specialty } = useLocalSearchParams<{
    clinicId: string;
    professionalId: string;
    professionalName: string;
    specialty: string;
  }>();
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState<string>(fmt(new Date()));
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [booking, setBooking] = useState(false);

  const [procedures, setProcedures] = useState<ProcedureSummary[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(true);
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureSummary | null>(null);

  const days = buildDays();

  // Load procedures for this professional
  useEffect(() => {
    if (!professionalId) return;
    getProfessionalProcedures(professionalId)
      .then(procs => {
        setProcedures(procs);
        if (procs.length > 0) {
          setSelectedProcedure(procs[0]);
          setDuration(procs[0].durationMinutes);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProcs(false));
  }, [professionalId]);

  const loadSlots = useCallback(async (date: string, dur: number) => {
    if (!professionalId) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const available = await getAvailableSlots(professionalId, date, dur);
      setSlots(available);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [professionalId]);

  useEffect(() => {
    loadSlots(selectedDate, duration);
  }, [selectedDate, duration, loadSlots]);

  function selectProcedure(proc: ProcedureSummary) {
    setSelectedProcedure(proc);
    setDuration(proc.durationMinutes);
  }

  function selectFallbackDuration(dur: number) {
    setSelectedProcedure(null);
    setDuration(dur);
  }

  async function handleBook() {
    if (!selectedSlot || !user || !professionalId) return;
    setBooking(true);
    try {
      await createTentativeBooking({
        professionalId,
        patientAuthId: user.id,
        patientName: user.email?.split('@')[0] ?? 'Patient',
        date: selectedDate,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        durationMinutes: duration,
        consultationType: selectedProcedure?.name || specialty || 'Consultation',
        paymentType: selectedProcedure?.paymentType,
        notes: notes.trim() || undefined,
      });
      Alert.alert(
        'Request sent!',
        'Your appointment request has been sent to the doctor. They will confirm or suggest a new time.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'slot_taken') {
        Alert.alert('Slot unavailable', 'This time was just booked. Please choose another slot.');
        loadSlots(selectedDate, duration);
      } else if (msg === 'patient_blocked') {
        Alert.alert(
          'Booking unavailable',
          'Your bookings with this professional are currently restricted. Please contact the clinic for assistance.',
        );
      } else if (msg === 'max_bookings_reached') {
        Alert.alert(
          'Limit reached',
          'You already have the maximum number of active appointments with this professional.',
        );
      } else {
        Alert.alert('Error', 'Could not send booking request. Please try again.');
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Book Appointment</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Doctor card */}
        <View style={styles.doctorCard}>
          <View style={styles.doctorIcon}>
            <Ionicons name="person" size={24} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.doctorName}>{professionalName}</Text>
            {specialty ? <Text style={styles.doctorSpec}>{specialty}</Text> : null}
          </View>
        </View>

        {/* Procedure / duration picker */}
        {loadingProcs ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={Colors.primary} size="small" />
          </View>
        ) : procedures.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Select procedure</Text>
            <View style={styles.procedureList}>
              {procedures.map(proc => {
                const active = selectedProcedure?.id === proc.id;
                return (
                  <TouchableOpacity
                    key={proc.id}
                    style={[styles.procedureBtn, active && styles.procedureBtnActive]}
                    onPress={() => selectProcedure(proc)}
                  >
                    <Text style={[styles.procedureName, active && styles.procedureNameActive]}>
                      {proc.name}
                    </Text>
                    <Text style={[styles.procedureMeta, active && styles.procedureMetaActive]}>
                      {proc.durationMinutes} min
                      {proc.price ? ` · R$ ${proc.price.toFixed(2)}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Session duration</Text>
            <View style={styles.durationRow}>
              {FALLBACK_DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationBtn, duration === d && styles.durationBtnActive]}
                  onPress={() => selectFallbackDuration(d)}
                >
                  <Text style={[styles.durationText, duration === d && styles.durationTextActive]}>
                    {d} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Date picker */}
        <Text style={styles.sectionLabel}>Pick a date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
        >
          {days.map(day => (
            <TouchableOpacity
              key={day}
              style={[styles.dayBtn, selectedDate === day && styles.dayBtnActive]}
              onPress={() => setSelectedDate(day)}
            >
              <Text style={[styles.dayText, selectedDate === day && styles.dayTextActive]}>
                {dayLabel(day)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Time slots */}
        <Text style={styles.sectionLabel}>Available times</Text>
        {loadingSlots ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : slots.length === 0 ? (
          <Text style={styles.noSlots}>No available slots for this day.</Text>
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map(slot => (
              <TouchableOpacity
                key={slot.start}
                style={[styles.slotBtn, selectedSlot?.start === slot.start && styles.slotBtnActive]}
                onPress={() => setSelectedSlot(slot)}
              >
                <Text style={[styles.slotText, selectedSlot?.start === slot.start && styles.slotTextActive]}>
                  {slot.start}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes */}
        <Text style={styles.sectionLabel}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Reason for visit, symptoms, etc."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Book button */}
        <TouchableOpacity
          style={[styles.bookBtn, (!selectedSlot || booking) && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={!selectedSlot || booking}
        >
          {booking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bookBtnText}>Send Booking Request</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          The doctor will confirm or suggest a different time. You&apos;ll be notified either way.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    topBarTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    doctorCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: `${Colors.primary}10`,
      borderRadius: 14, padding: 14,
      borderWidth: 1.5, borderColor: `${Colors.primary}40`,
    },
    doctorIcon: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: `${Colors.primary}20`,
      alignItems: 'center', justifyContent: 'center',
    },
    doctorName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    doctorSpec: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
    procedureList: { gap: 8 },
    procedureBtn: {
      paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12,
      borderWidth: 1.5, borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    procedureBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}12` },
    procedureName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
    procedureNameActive: { color: Colors.primary },
    procedureMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    procedureMetaActive: { color: `${Colors.primary}cc` },
    durationRow: { flexDirection: 'row', gap: 10 },
    durationBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10,
      borderWidth: 1.5, borderColor: Colors.border,
      alignItems: 'center', backgroundColor: Colors.surface,
    },
    durationBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
    durationText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
    durationTextActive: { color: Colors.primary },
    dayRow: { gap: 8, paddingBottom: 4 },
    dayBtn: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1.5, borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    dayBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
    dayText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
    dayTextActive: { color: Colors.primary },
    slotsLoading: { height: 60, alignItems: 'center', justifyContent: 'center' },
    noSlots: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },
    slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slotBtn: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
    },
    slotBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
    slotText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
    slotTextActive: { color: Colors.primary },
    notesInput: {
      backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
      borderRadius: 12, padding: 12, fontSize: 14, color: Colors.textPrimary,
      minHeight: 80,
    },
    bookBtn: {
      backgroundColor: Colors.primary, height: 52, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', marginTop: 4,
      shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
    },
    bookBtnDisabled: { opacity: 0.5 },
    bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    hint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  });
}
