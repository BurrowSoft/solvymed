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
  TextInput,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, updatePaymentStatus, updateAppointmentStatus,
  getAppointmentCountsByWeek, getPatient, updateAppointment, getProfessional,
} from '@/lib/services';
import { getTemplate } from '@/lib/template-service';
import { buildInvoiceHtml } from '@/lib/pdf-utils';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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

function calcAge(birthDate: string): string {
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} mo`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

async function shareInvoice(appt: Appointment, professionalId: string) {
  try {
    const [patient, professional, template] = await Promise.all([
      appt.patientId ? getPatient(appt.patientId).catch(() => null) : Promise.resolve(null),
      getProfessional(professionalId),
      getTemplate(professionalId, 'invoice').catch(() => null),
    ]);
    const fallbackPatient = { id: '', fullName: appt.patientName, createdAt: '' };
    const fallbackTemplate = { professionalId, documentType: 'invoice' as const, primaryColor: '#208AEF', accentColor: '#E8F4FE' };
    const html = buildInvoiceHtml(
      patient ?? fallbackPatient,
      appt,
      professional ?? { id: professionalId, fullName: '', email: '' },
      template ?? fallbackTemplate,
    );
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Invoice' });
    } else {
      await Print.printAsync({ html });
    }
  } catch {
    // silent — user can retry
  }
}

function AppointmentModal({ appt, onClose, onMarkPaid, onStatusChange, onEdit, onAmountUpdated }: {
  appt: Appointment | null;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  onStatusChange: (id: string, status: Appointment['status']) => void;
  onEdit: (appt: Appointment) => void;
  onAmountUpdated: (id: string, amount: number) => void;
}) {
  const { user } = useAuth();
  const [patientPhone, setPatientPhone] = React.useState<string | null>(null);
  const [patientAge, setPatientAge] = React.useState<string | null>(null);
  const [editingAmount, setEditingAmount] = React.useState(false);
  const [amountValue, setAmountValue] = React.useState('');
  const [displayAmount, setDisplayAmount] = React.useState<number | undefined>(undefined);
  const [generatingInvoice, setGeneratingInvoice] = React.useState(false);

  React.useEffect(() => {
    setDisplayAmount(appt?.paymentAmount);
    setAmountValue(appt?.paymentAmount?.toString() ?? '');
    setEditingAmount(false);
  }, [appt?.id]);

  React.useEffect(() => {
    if (!appt?.patientId) { setPatientPhone(null); setPatientAge(null); return; }
    getPatient(appt.patientId)
      .then(p => {
        setPatientPhone(p.phone ?? null);
        setPatientAge(p.birthDate ? calcAge(p.birthDate) : null);
      })
      .catch(() => { setPatientPhone(null); setPatientAge(null); });
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
              {patientAge && <Text style={styles.modalPatientAge}>{patientAge}</Text>}
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

              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => {
                  const link = `https://pay.solvymed.app/${appt.id}`;
                  Share.share({ message: `Payment link for your appointment on ${appt.date} at ${appt.startTime}:\n${link}`, url: link });
                }}
              >
                <Ionicons name="link-outline" size={16} color={Colors.primary} />
                <Text style={styles.modalActionText}>Share payment link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalAction}
                disabled={generatingInvoice}
                onPress={async () => {
                  if (!user) return;
                  setGeneratingInvoice(true);
                  await shareInvoice(appt, user.id);
                  setGeneratingInvoice(false);
                }}
              >
                {generatingInvoice
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                }
                <Text style={styles.modalActionText}>Generate invoice PDF</Text>
              </TouchableOpacity>

              <View style={styles.modalRow}>
                <View style={[styles.statusDot, { backgroundColor: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]} />
                <Text style={styles.modalMeta}>{appt.paymentType === 'private' ? 'Private' : 'Insurance'}</Text>
                {editingAmount ? (
                  <View style={styles.amountEditRow}>
                    <Text style={styles.modalMeta}>R$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amountValue}
                      onChangeText={setAmountValue}
                      keyboardType="decimal-pad"
                      autoFocus
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={async () => {
                        const v = parseFloat(amountValue);
                        if (!isNaN(v)) {
                          await updateAppointment(appt.id, { paymentAmount: v }).catch(() => {});
                          setDisplayAmount(v);
                          onAmountUpdated(appt.id, v);
                        }
                        setEditingAmount(false);
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingAmount(false)}>
                      <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.amountDisplay}
                    onPress={() => { setAmountValue(displayAmount?.toString() ?? ''); setEditingAmount(true); }}
                  >
                    <Text style={styles.modalMeta}>
                      {displayAmount != null ? `R$ ${displayAmount.toFixed(2)}` : 'Set amount'}
                    </Text>
                    <Ionicons name="pencil-outline" size={13} color={Colors.primary} />
                  </TouchableOpacity>
                )}
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

          {!isBlocked && appt.extraItems && appt.extraItems.length > 0 && (
            <>
              <Text style={[styles.modalSectionTitle, { marginTop: 4 }]}>Additional Items</Text>
              {appt.extraItems.map((item, i) => (
                <View key={i} style={styles.extraItemRow}>
                  <Text style={[styles.modalMeta, { flex: 1 }]}>{item.name}</Text>
                  {item.price != null && (
                    <Text style={styles.modalMeta}>R$ {item.price.toFixed(2)}</Text>
                  )}
                </View>
              ))}
            </>
          )}

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
  const [filterStatuses, setFilterStatuses] = useState<Set<Appointment['status']>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'in-person' | 'online'>('all');
  const [showFilter, setShowFilter] = useState(false);

  const activeFilterCount = filterStatuses.size + (filterType !== 'all' ? 1 : 0);

  function toggleStatus(s: Appointment['status']) {
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  function clearFilters() {
    setFilterStatuses(new Set());
    setFilterType('all');
  }

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

  const dayAppointments = appointments.filter(a => {
    if (filterStatuses.size > 0 && !filterStatuses.has(a.status)) return false;
    if (filterType !== 'all' && a.type !== filterType) return false;
    return true;
  });

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
          <TouchableOpacity onPress={() => setShowFilter(true)} style={styles.todayBtn}>
            <Ionicons name="filter-outline" size={18} color={activeFilterCount > 0 ? Colors.primary : Colors.textSecondary} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
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
        onAmountUpdated={(id, amount) => setAppointments(prev => prev.map(a => a.id === id ? { ...a, paymentAmount: amount } : a))}
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

      {/* Filter sheet */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setShowFilter(false)}>
          <Pressable style={styles.filterSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.filterClear}>Clear all</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterPillRow}>
              {(['scheduled', 'confirmed', 'completed', 'cancelled'] as Appointment['status'][]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterPill, filterStatuses.has(s) && styles.filterPillActive]}
                  onPress={() => toggleStatus(s)}
                >
                  <Text style={[styles.filterPillText, filterStatuses.has(s) && styles.filterPillTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterLabel}>Type</Text>
            <View style={styles.filterPillRow}>
              {(['all', 'in-person', 'online'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterPill, filterType === t && styles.filterPillActive]}
                  onPress={() => setFilterType(t)}
                >
                  <Text style={[styles.filterPillText, filterType === t && styles.filterPillTextActive]}>
                    {t === 'all' ? 'All' : t === 'in-person' ? 'In-Person' : 'Online'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={() => setShowFilter(false)}>
              <Text style={styles.filterApplyText}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  modalPatientAge: { fontSize: 12, color: Colors.textSecondary, marginTop: 1, marginBottom: 2 },
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 13, color: Colors.textPrimary, minWidth: 70 },
  amountDisplay: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { fontSize: 8, fontWeight: '700', color: '#fff' },
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, gap: 12 },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  filterTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  filterClear: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  filterLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  filterPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterPillTextActive: { color: '#fff' },
  filterApplyBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  filterApplyText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  extraItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
});
