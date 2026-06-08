import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';

const HOUR_HEIGHT = 64;
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type ViewMode = 'day' | 'week';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getWeekDates(date: Date) {
  const day = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function AppointmentBlock({ appt, onPress }: { appt: Appointment; onPress: () => void }) {
  const startMin = timeToMinutes(appt.startTime) - START_HOUR * 60;
  const duration = appt.durationMinutes;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max((duration / 60) * HOUR_HEIGHT - 2, 28);
  const isBlocked = appt.status === 'blocked';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.apptBlock,
        {
          top,
          height,
          backgroundColor: isBlocked ? Colors.blockedBg : Colors.primaryLight,
          borderLeftColor: isBlocked ? Colors.blocked : Colors.primary,
        },
      ]}
      activeOpacity={0.85}
    >
      <Text style={[styles.apptText, { color: isBlocked ? Colors.textMuted : Colors.primaryDark }]} numberOfLines={1}>
        {isBlocked ? `BLOCKED | ${appt.consultationType}` : appt.patientName}
      </Text>
      {!isBlocked && (
        <Text style={styles.apptSubText} numberOfLines={1}>
          {appt.consultationType} · {appt.type === 'online' ? 'Online' : 'In-Person'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function AppointmentModal({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  if (!appt) return null;
  const isBlocked = appt.status === 'blocked';

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Appointment</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!isBlocked && (
            <>
              <Text style={styles.modalPatient}>{appt.patientName}</Text>
              <TouchableOpacity style={styles.modalAction}>
                <Ionicons name="logo-whatsapp" size={16} color={Colors.primary} />
                <Text style={styles.modalActionText}>Send WhatsApp message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => appt && Linking.openURL(`tel:${appt.patientId}`)}
              >
                <Ionicons name="call-outline" size={16} color={Colors.primary} />
                <Text style={styles.modalActionText}>Call patient</Text>
              </TouchableOpacity>

              <View style={styles.modalRow}>
                <View style={[styles.statusDot, { backgroundColor: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]} />
                <Text style={styles.modalMeta}>
                  Private R$ {appt.paymentAmount?.toFixed(2)}
                </Text>
                <TouchableOpacity style={styles.chip}>
                  <Text style={styles.chipText}>
                    {appt.paymentStatus === 'paid' ? 'Paid' : 'Mark as paid'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.modalDivider} />
          <Text style={styles.modalMeta}>
            {appt.date} · {appt.startTime} ({appt.durationMinutes} min)
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: Colors.primaryLight }]}>
              <Text style={[styles.statusBadgeText, { color: Colors.primaryDark }]}>
                {isBlocked ? 'Blocked' : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.modalDivider} />
          <Text style={styles.modalSectionTitle}>Details</Text>
          <Text style={styles.modalMeta}>{appt.consultationType}</Text>
          <Text style={styles.modalMeta}>{appt.type === 'online' ? 'Online' : 'In-Person'}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ScheduleScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const dateStr = fmt(selectedDate);
  const weekDates = getWeekDates(selectedDate);

  const dayAppointments = MOCK_APPOINTMENTS.filter(a => a.date === dateStr);

  function navigate(dir: -1 | 1) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + (viewMode === 'day' ? dir : dir * 7));
    setSelectedDate(d);
  }

  const headerLabel = viewMode === 'day'
    ? `${DAYS[selectedDate.getDay()].toUpperCase()} ${String(selectedDate.getDate()).padStart(2, '0')} ${MONTHS[selectedDate.getMonth()].toUpperCase()} ${selectedDate.getFullYear()}`
    : `${DAYS[weekDates[0].getDay()]} ${weekDates[0].getDate()} - ${DAYS[weekDates[6].getDay()]} ${weekDates[6].getDate()}, ${MONTHS[weekDates[0].getMonth()]} ${weekDates[0].getFullYear()}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerNav}>
          <TouchableOpacity onPress={() => navigate(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerDate}>{headerLabel}</Text>
          <TouchableOpacity onPress={() => navigate(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.todayBtn}>
            <Ionicons name="today-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              onPress={() => setViewMode('day')}
              style={[styles.toggleBtn, viewMode === 'day' && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'day' && styles.toggleTextActive]}>Day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('week')}
              style={[styles.toggleBtn, viewMode === 'week' && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>Week</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Week day selector (shown in week mode) */}
      {viewMode === 'week' && (
        <View style={styles.weekRow}>
          {weekDates.map((d, i) => {
            const isSelected = fmt(d) === dateStr;
            const hasAppts = MOCK_APPOINTMENTS.some(a => a.date === fmt(d));
            return (
              <TouchableOpacity
                key={i}
                style={[styles.weekDay, isSelected && styles.weekDaySelected]}
                onPress={() => { setSelectedDate(d); setViewMode('day'); }}
              >
                <Text style={[styles.weekDayName, isSelected && styles.weekDayTextSelected]}>{DAYS[d.getDay()]}</Text>
                <Text style={[styles.weekDayNum, isSelected && styles.weekDayTextSelected]}>{d.getDate()}</Text>
                {hasAppts && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Time grid */}
      <ScrollView style={styles.grid} showsVerticalScrollIndicator={false}>
        <View style={{ position: 'relative' }}>
          {HOURS.map(hour => (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{String(hour).padStart(2, '0')}:00</Text>
              <View style={styles.hourLine} />
            </View>
          ))}

          {/* Appointment blocks */}
          <View style={styles.apptLayer}>
            {dayAppointments.map(appt => (
              <AppointmentBlock
                key={appt.id}
                appt={appt}
                onPress={() => setSelectedAppt(appt)}
              />
            ))}
          </View>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color="#fff" />
        <Text style={styles.fabText}>New Appointment</Text>
      </TouchableOpacity>

      <AppointmentModal appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  headerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  headerDate: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  navBtn: { padding: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayBtn: { padding: 6 },
  viewToggle: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 8, padding: 2 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 6 },
  toggleActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  toggleTextActive: { color: '#fff' },
  weekRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 8 },
  weekDaySelected: { backgroundColor: Colors.primary },
  weekDayName: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  weekDayNum: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  weekDayTextSelected: { color: '#fff' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 2 },
  dotSelected: { backgroundColor: '#fff' },
  grid: { flex: 1 },
  hourRow: {
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  hourLabel: { width: 52, paddingLeft: 12, fontSize: 11, color: Colors.textMuted },
  hourLine: { flex: 1, height: 1, backgroundColor: Colors.border, marginTop: 7 },
  apptLayer: { position: 'absolute', left: 56, right: 8, top: 0 },
  apptBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  apptText: { fontSize: 12, fontWeight: '600' },
  apptSubText: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    gap: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  modalPatient: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  modalAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalActionText: { fontSize: 14, color: Colors.primary },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  chip: { backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 'auto' },
  chipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  modalDivider: { height: 1, backgroundColor: Colors.border },
  modalMeta: { fontSize: 13, color: Colors.textSecondary },
  statusRow: { flexDirection: 'row' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  modalSectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
