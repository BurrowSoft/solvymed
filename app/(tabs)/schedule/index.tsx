import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, updatePaymentStatus, updateAppointmentStatus,
  getAppointmentCountsByWeek, getPatient,
} from '@/lib/services';
import { cancelAppointmentReminder } from '@/lib/notifications';
import { useAuth } from '@/lib/auth-context';
import { NewAppointmentModal } from '@/components/NewAppointmentModal';
import { BlockTimeModal } from '@/components/BlockTimeModal';
import { AppointmentSearchModal } from '@/components/AppointmentSearchModal';

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

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${number}`;
}

function whatsappConfirmUrl(phone: string, appt: Appointment) {
  const digits = phone.replace(/\D/g, '');
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const msg =
    `Hello ${appt.patientName}, your appointment is confirmed:\n` +
    `Date: ${appt.date}\n` +
    `Time: ${appt.startTime} (${appt.durationMinutes} min)\n` +
    `Type: ${appt.consultationType}${appt.type === 'online' ? ' — Online' : ''}\n\n` +
    `See you then!`;
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

function statusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return Colors.primary;
    case 'completed': return Colors.success;
    case 'cancelled': return Colors.danger;
    case 'blocked': return Colors.blocked;
    default: return Colors.warning;
  }
}

function AppointmentModal({ appt, onClose, onMarkPaid, onStatusChange, onEdit }: {
  appt: Appointment | null;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  onStatusChange: (id: string, status: Appointment['status']) => void;
  onEdit: (appt: Appointment) => void;
}) {
  const [patientPhone, setPatientPhone] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!appt?.patientId) { setPatientPhone(null); return; }
    getPatient(appt.patientId).then(p => setPatientPhone(p.phone ?? null)).catch(() => setPatientPhone(null));
  }, [appt?.patientId]);

  if (!appt) return null;
  const isBlocked = appt.status === 'blocked';

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Appointment</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {!isBlocked && (
                <TouchableOpacity
                  onPress={() => { onClose(); onEdit(appt); }}
                  style={styles.editApptBtn}
                >
                  <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                  <Text style={styles.editApptBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {!isBlocked && (
            <>
              <Text style={styles.modalPatient}>{appt.patientName}</Text>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => patientPhone && Linking.openURL(whatsappConfirmUrl(patientPhone, appt))}
                disabled={!patientPhone}
              >
                <Ionicons name="logo-whatsapp" size={16} color={patientPhone ? '#25D366' : Colors.textMuted} />
                <Text style={[styles.modalActionText, !patientPhone && { color: Colors.textMuted }]}>
                  {patientPhone ? 'Send confirmation' : 'No phone — add in patient profile'}
                </Text>
              </TouchableOpacity>
              {patientPhone && (
                <TouchableOpacity
                  style={styles.modalAction}
                  onPress={() => Linking.openURL(whatsappUrl(patientPhone))}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
                  <Text style={[styles.modalActionText, { color: Colors.textSecondary }]}>Open WhatsApp chat</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => patientPhone && Linking.openURL(`tel:${patientPhone}`)}
                disabled={!patientPhone}
              >
                <Ionicons name="call-outline" size={16} color={patientPhone ? Colors.primary : Colors.textMuted} />
                <Text style={[styles.modalActionText, !patientPhone && { color: Colors.textMuted }]}>
                  {patientPhone ? `Call ${patientPhone}` : 'No phone number'}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalRow}>
                <View style={[styles.statusDot, { backgroundColor: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]} />
                <Text style={styles.modalMeta}>
                  {appt.paymentType === 'private' ? 'Private' : 'Insurance'}{appt.paymentAmount ? ` · R$ ${appt.paymentAmount.toFixed(2)}` : ''}
                </Text>
                {appt.paymentStatus !== 'paid' ? (
                  <TouchableOpacity style={styles.chip} onPress={() => onMarkPaid(appt.id)}>
                    <Text style={styles.chipText}>Mark as paid</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.chip, styles.chipPaid]}>
                    <Ionicons name="checkmark" size={12} color={Colors.success} />
                    <Text style={[styles.chipText, { color: Colors.success }]}>Paid</Text>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={styles.modalDivider} />
          <Text style={styles.modalMeta}>
            {appt.date} · {appt.startTime} ({appt.durationMinutes} min)
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(appt.status) + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor(appt.status) }]}>
                {isBlocked ? 'Blocked' : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.modalDivider} />
          <Text style={styles.modalSectionTitle}>Details</Text>
          <Text style={styles.modalMeta}>{appt.consultationType}</Text>
          <Text style={styles.modalMeta}>{appt.type === 'online' ? 'Online' : 'In-Person'}</Text>

          {!isBlocked && appt.notes ? (
            <>
              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>Notes</Text>
              <Text style={styles.modalMeta}>{appt.notes}</Text>
            </>
          ) : null}

          {!isBlocked && appt.status !== 'completed' && appt.status !== 'cancelled' && (
            <>
              <View style={styles.modalDivider} />
              <View style={styles.statusActions}>
                {appt.status === 'scheduled' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: Colors.primaryLight }]}
                    onPress={() => { onStatusChange(appt.id, 'confirmed'); onClose(); }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
                    <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Confirm</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.success + '20' }]}
                  onPress={() => { onStatusChange(appt.id, 'completed'); onClose(); }}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color={Colors.success} />
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.danger + '20' }]}
                  onPress={() => { onStatusChange(appt.id, 'cancelled'); onClose(); }}
                >
                  <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ScheduleScreen() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [showBlockTime, setShowBlockTime] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});

  const dateStr = fmt(selectedDate);
  const weekDates = getWeekDates(selectedDate);

  const loadAppointments = useCallback(async () => {
    if (!user) {
      setAppointments(MOCK_APPOINTMENTS);
      return;
    }
    setLoading(true);
    try {
      const data = await getAppointmentsByDate(user.id, dateStr);
      setAppointments(data);
    } catch {
      setAppointments(MOCK_APPOINTMENTS.filter(a => a.date === dateStr));
    } finally {
      setLoading(false);
    }
  }, [user, dateStr]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  useEffect(() => {
    if (!user || viewMode !== 'week') return;
    const from = fmt(weekDates[0]);
    const to = fmt(weekDates[6]);
    getAppointmentCountsByWeek(user.id, from, to).then(setWeekCounts).catch(() => {});
  }, [user, viewMode, fmt(weekDates[0])]);

  async function handleMarkPaid(apptId: string) {
    if (user) await updatePaymentStatus(apptId, 'paid');
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, paymentStatus: 'paid' } : a));
    setSelectedAppt(prev => prev?.id === apptId ? { ...prev, paymentStatus: 'paid' } : prev);
  }

  async function handleStatusChange(apptId: string, status: Appointment['status']) {
    if (user) await updateAppointmentStatus(apptId, status);
    if (status === 'cancelled') cancelAppointmentReminder(apptId).catch(() => {});
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status } : a));
    setSelectedAppt(prev => prev?.id === apptId ? { ...prev, status } : prev);
  }

  const dayAppointments = appointments;

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
          <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.todayBtn}>
            <Ionicons name="search-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
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
            const dStr = fmt(d);
            const isSelected = dStr === dateStr;
            const isToday = dStr === fmt(new Date());
            const count = user
              ? (weekCounts[dStr] ?? 0)
              : MOCK_APPOINTMENTS.filter(a => a.date === dStr && a.status !== 'blocked').length;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.weekDay, isSelected && styles.weekDaySelected, isToday && !isSelected && styles.weekDayToday]}
                onPress={() => { setSelectedDate(d); setViewMode('day'); }}
              >
                <Text style={[styles.weekDayName, isSelected && styles.weekDayTextSelected]}>{DAYS[d.getDay()]}</Text>
                <Text style={[styles.weekDayNum, isSelected && styles.weekDayTextSelected, isToday && !isSelected && { color: Colors.primary }]}>{d.getDate()}</Text>
                {count > 0 ? (
                  <View style={[styles.countBadge, isSelected && styles.countBadgeSelected]}>
                    <Text style={[styles.countBadgeText, isSelected && styles.countBadgeTextSelected]}>{count}</Text>
                  </View>
                ) : <View style={styles.dotPlaceholder} />}
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

      {/* FAB group */}
      <View style={styles.fabGroup}>
        <TouchableOpacity style={styles.blockBtn} onPress={() => setShowBlockTime(true)}>
          <Ionicons name="remove-circle-outline" size={15} color={Colors.textSecondary} />
          <Text style={styles.blockBtnText}>Block time</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => setShowNewAppt(true)}>
          <Ionicons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>New Appointment</Text>
        </TouchableOpacity>
      </View>

      <AppointmentModal
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onMarkPaid={handleMarkPaid}
        onStatusChange={handleStatusChange}
        onEdit={(appt) => { setSelectedAppt(null); setEditingAppt(appt); }}
      />

      <NewAppointmentModal
        visible={showNewAppt || !!editingAppt}
        editAppt={editingAppt ?? undefined}
        defaultDate={editingAppt?.date ?? dateStr}
        onClose={() => { setShowNewAppt(false); setEditingAppt(null); }}
        onSaved={(appt) => {
          setShowNewAppt(false);
          if (appt.date === dateStr) {
            setAppointments(prev => [...prev, appt].sort((a, b) => a.startTime.localeCompare(b.startTime)));
          }
        }}
        onUpdated={(updated) => {
          setEditingAppt(null);
          setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
        }}
      />

      <AppointmentSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
      />

      <BlockTimeModal
        visible={showBlockTime}
        defaultDate={dateStr}
        onClose={() => setShowBlockTime(false)}
        onSaved={(appt) => {
          if (appt.date === dateStr) {
            setAppointments(prev => [...prev, appt].sort((a, b) => a.startTime.localeCompare(b.startTime)));
          }
        }}
      />
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
  weekDayToday: { borderWidth: 1, borderColor: Colors.primary },
  countBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginTop: 2 },
  countBadgeSelected: { backgroundColor: '#fff' },
  countBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  countBadgeTextSelected: { color: Colors.primary },
  dotPlaceholder: { height: 16, marginTop: 2 },
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
  fabGroup: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    alignItems: 'flex-end',
    gap: 8,
  },
  blockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  blockBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  fab: {
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
  chipPaid: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  editApptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  editApptBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  statusActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, minWidth: 80 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
});
