import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment, Professional, WorkingHoursKey } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, updatePaymentStatus, updateAppointmentStatus,
  getAppointmentCountsByWeek, getPatient, updateAppointment, getProfessional, deleteAppointment,
  getPatientAppointments,
} from '@/lib/services';
import { getTemplate } from '@/lib/template-service';
import { buildInvoiceHtml } from '@/lib/pdf-utils';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cancelAppointmentReminder } from '@/lib/notifications';
import { useAuth } from '@/lib/auth-context';
import { useRole } from '@/lib/role-context';
import { t, getLocale } from '@/lib/i18n';
import {
  formatScheduleDayHeader, formatScheduleWeekHeader,
  formatWeekdayShort, formatCurrency, formatAgeLabel, formatTime, translateConsultType,
} from '@/lib/locale-utils';
import { NewAppointmentModal } from '@/components/NewAppointmentModal';
import { BlockTimeModal } from '@/components/BlockTimeModal';
import { AppointmentSearchModal } from '@/components/AppointmentSearchModal';
import WhatsAppRemindersModal from '@/components/WhatsAppRemindersModal';
import { useStyles } from '@/lib/use-styles';

const HOUR_HEIGHT = 64;
const LINE_OFFSET = 11; // hourRow.paddingTop(4) + hourLine.marginTop(7) — aligns blocks to hour lines
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type ViewMode = 'day' | 'week' | 'month';


function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function computeLayout(appointments: Appointment[]): Record<string, { col: number; totalCols: number }> {
  if (!appointments.length) return {};
  const sorted = [...appointments].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const groups: Appointment[][] = [];
  let current: Appointment[] = [];
  let groupEnd = 0;
  for (const appt of sorted) {
    const start = timeToMinutes(appt.startTime);
    if (current.length === 0 || start < groupEnd) {
      current.push(appt);
      groupEnd = Math.max(groupEnd, start + appt.durationMinutes);
    } else {
      if (current.length) groups.push(current);
      current = [appt];
      groupEnd = start + appt.durationMinutes;
    }
  }
  if (current.length) groups.push(current);

  const result: Record<string, { col: number; totalCols: number }> = {};
  for (const group of groups) {
    if (group.length === 1) {
      result[group[0].id] = { col: 0, totalCols: 1 };
      continue;
    }
    const colEnds: number[] = [];
    const cols: Record<string, number> = {};
    for (const appt of group) {
      const start = timeToMinutes(appt.startTime);
      let col = colEnds.findIndex(end => end <= start);
      if (col === -1) col = colEnds.length;
      colEnds[col] = start + appt.durationMinutes;
      cols[appt.id] = col;
    }
    const totalCols = colEnds.length;
    for (const appt of group) result[appt.id] = { col: cols[appt.id], totalCols };
  }
  return result;
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

function getMonthDates(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function AppointmentBlock({ appt, onPress, col, totalCols }: { appt: Appointment; onPress: () => void; col: number; totalCols: number }) {
  const styles = useStyles(makeStyles);
  const startMin = timeToMinutes(appt.startTime) - START_HOUR * 60;
  const duration = appt.durationMinutes;
  const top = LINE_OFFSET + (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max((duration / 60) * HOUR_HEIGHT, 28);
  const isBlocked = appt.status === 'blocked';
  const colWidth = `${(100 / totalCols).toFixed(1)}%`;
  const colLeft = `${((col / totalCols) * 100).toFixed(1)}%`;

  const color = isBlocked ? Colors.blocked : statusColor(appt.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.apptBlock,
        {
          top,
          height,
          left: colLeft,
          width: colWidth,
          backgroundColor: color + '20',
          borderLeftColor: color,
        },
      ]}
      activeOpacity={0.85}
    >
      <Text style={[styles.apptText, { color: isBlocked ? Colors.textMuted : color }]} numberOfLines={1}>
        {isBlocked ? (appt.notes ? `BLOCKED | ${appt.notes}` : t('status.blocked').toUpperCase()) : appt.patientName}
      </Text>
      {!isBlocked && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.apptSubText, { flex: 1 }]} numberOfLines={1}>
            {translateConsultType(appt.consultationType)} · {t(appt.type === 'online' ? 'apptType.online' : 'apptType.inPerson')}
          </Text>
          {!!appt.notes && <Ionicons name="bookmark" size={10} color={color} />}
        </View>
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
  const typeStr = `${translateConsultType(appt.consultationType)}${appt.type === 'online' ? ' — Online' : ''}`;
  const msg = (t('appt.confirmMessage' as any) as string)
    .replace('{{name}}', appt.patientName.split(' ')[0])
    .replace('{{date}}', appt.date)
    .replace('{{time}}', formatTime(appt.startTime))
    .replace('{{duration}}', String(appt.durationMinutes))
    .replace('{{type}}', typeStr);
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

function statusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return Colors.primary;
    case 'completed': return Colors.success;
    case 'cancelled': return Colors.danger;
    case 'blocked': return Colors.blocked;
    case 'late': return Colors.late;
    case 'absent': return Colors.absent;
    default: return Colors.warning;
  }
}

function calcAge(birthDate: string): string {
  return formatAgeLabel(birthDate);
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

function AppointmentModal({ appt, onClose, onMarkPaid, onStatusChange, onEdit, onAmountUpdated, onDelete, pixKey }: {
  appt: Appointment | null;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  onStatusChange: (id: string, status: Appointment['status']) => void;
  onEdit: (appt: Appointment) => void;
  onAmountUpdated: (id: string, amount: number) => void;
  onDelete: (id: string) => void;
  pixKey?: string;
}) {
  const styles = useStyles(makeStyles);
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
            <Text style={styles.modalTitle}>{t('appt.title')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {!isBlocked && (
                <TouchableOpacity
                  onPress={() => { onClose(); onEdit(appt); }}
                  style={styles.editApptBtn}
                >
                  <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                  <Text style={styles.editApptBtnText}>{t('common.edit')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => Alert.alert(
                  t('appt.title'),
                  '',
                  [
                    {
                      text: t('appt.delete'),
                      style: 'destructive',
                      onPress: () => Alert.alert(
                        t('appt.deleteTitle'),
                        t('appt.deleteMessage'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => { onDelete(appt.id); onClose(); } },
                        ],
                      ),
                    },
                    { text: t('common.cancel'), style: 'cancel' },
                  ],
                )}
              >
                <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {!isBlocked && (
            <>
              <Text style={styles.modalPatient}>{appt.patientName}{patientAge ? ` | ${patientAge}` : ''}</Text>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => patientPhone && Linking.openURL(whatsappConfirmUrl(patientPhone, appt))}
                disabled={!patientPhone}
              >
                <Ionicons name="logo-whatsapp" size={16} color={patientPhone ? '#25D366' : Colors.textMuted} />
                <Text style={[styles.modalActionText, !patientPhone && { color: Colors.textMuted }]}>
                  {patientPhone ? t('appt.sendConfirmation') : t('appt.noPhoneAdd')}
                </Text>
              </TouchableOpacity>
              {patientPhone && (
                <TouchableOpacity
                  style={styles.modalAction}
                  onPress={() => Linking.openURL(whatsappUrl(patientPhone))}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
                  <Text style={[styles.modalActionText, { color: Colors.textSecondary }]}>{t('appt.openWhatsapp')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => patientPhone && Linking.openURL(`tel:${patientPhone}`)}
                disabled={!patientPhone}
              >
                <Ionicons name="call-outline" size={16} color={patientPhone ? Colors.primary : Colors.textMuted} />
                <Text style={[styles.modalActionText, !patientPhone && { color: Colors.textMuted }]}>
                  {patientPhone ? t('appt.call', { phone: patientPhone }) : t('appt.noPhone')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => {
                  const link = `https://pay.solvymed.app/${appt.id}`;
                  let payMsg = (t('appt.paymentLinkMessage' as any) as string)
                    .replace('{{date}}', appt.date)
                    .replace('{{time}}', appt.startTime)
                    .replace('{{link}}', link);
                  if (pixKey && getLocale() === 'pt-BR') payMsg += `\n\nPix: ${pixKey}`;
                  Share.share({ message: payMsg, url: link });
                }}
              >
                <Ionicons name="link-outline" size={16} color={Colors.primary} />
                <Text style={styles.modalActionText}>{t('appt.sharePaymentLink')}</Text>
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
                <Text style={styles.modalActionText}>{t('appt.generateInvoice')}</Text>
              </TouchableOpacity>

              <View style={styles.modalRow}>
                <View style={[styles.statusDot, { backgroundColor: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]} />
                <Text style={styles.modalMeta}>{appt.paymentType === 'private' ? t('newAppt.private') : t('newAppt.insurance')}</Text>
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
                      {displayAmount != null ? formatCurrency(displayAmount) : t('appt.setAmount')}
                    </Text>
                    <Ionicons name="pencil-outline" size={13} color={Colors.primary} />
                  </TouchableOpacity>
                )}
                {appt.paymentStatus !== 'paid' ? (
                  <TouchableOpacity style={styles.chip} onPress={() => onMarkPaid(appt.id)}>
                    <Text style={styles.chipText}>{t('appt.markPaid')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.chip, styles.chipPaid]}>
                    <Ionicons name="checkmark" size={12} color={Colors.success} />
                    <Text style={[styles.chipText, { color: Colors.success }]}>{t('appt.paid')}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={styles.modalDivider} />
          <Text style={styles.modalMeta}>
            {appt.date} · {formatTime(appt.startTime)} ({appt.durationMinutes} min)
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(appt.status) + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor(appt.status) }]}>
                {t((isBlocked ? 'status.blocked' : `status.${appt.status}`) as any)}
              </Text>
            </View>
          </View>

          <View style={styles.modalDivider} />
          <Text style={styles.modalSectionTitle}>{t('appt.details')}</Text>
          <Text style={styles.modalMeta}>{translateConsultType(appt.consultationType)}</Text>
          <Text style={styles.modalMeta}>{t(appt.type === 'online' ? 'apptType.online' : 'apptType.inPerson')}</Text>
          {appt.scheduledBy ? (
            <Text style={styles.modalMeta}>{t('appt.scheduledBy', { name: appt.scheduledBy })}</Text>
          ) : null}

          {!isBlocked && appt.extraItems && appt.extraItems.length > 0 && (
            <>
              <Text style={[styles.modalSectionTitle, { marginTop: 4 }]}>{t('appt.additionalItems')}</Text>
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
              <Text style={styles.modalSectionTitle}>{t('appt.notes')}</Text>
              <Text style={styles.modalMeta}>{appt.notes}</Text>
            </>
          ) : null}

          {!isBlocked && (
            <>
              <View style={styles.modalDivider} />
              <Text style={styles.modalSectionTitle}>{t('appt.status')}</Text>
              <View style={styles.statusActions}>
                {(['scheduled', 'confirmed', 'completed', 'cancelled', 'late', 'absent'] as Appointment['status'][]).map(s => {
                  const active = appt.status === s;
                  const color = statusColor(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.actionBtn, { backgroundColor: active ? color + '30' : Colors.background, borderWidth: 1, borderColor: active ? color : Colors.border }]}
                      onPress={() => { if (!active) { onStatusChange(appt.id, s); onClose(); } }}
                    >
                      <Text style={[styles.actionBtnText, { color: active ? color : Colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
                        {t(`status.${s}` as any)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ScheduleScreen() {
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const { role, linkedPatientId } = useRole();
  const isPatient = role === 'patient';
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [showBlockTime, setShowBlockTime] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [filterStatuses, setFilterStatuses] = useState<Set<Appointment['status']>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'in-person' | 'online'>('all');
  const [showFilter, setShowFilter] = useState(false);
  const [professional, setProfessional] = useState<Professional | null>(null);

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
      let data: Appointment[];
      if (isPatient && linkedPatientId) {
        data = await getPatientAppointments(linkedPatientId, dateStr, dateStr);
      } else {
        data = await getAppointmentsByDate(user.id, dateStr);
      }
      setAppointments(data);
    } catch {
      setAppointments(isPatient ? [] : MOCK_APPOINTMENTS.filter(a => a.date === dateStr));
    } finally {
      setLoading(false);
    }
  }, [user, dateStr, isPatient, linkedPatientId]);

  useFocusEffect(useCallback(() => { loadAppointments(); }, [loadAppointments]));

  useEffect(() => {
    if (!user) return;
    getProfessional(user.id).then(setProfessional).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || viewMode !== 'week') return;
    const from = fmt(weekDates[0]);
    const to = fmt(weekDates[6]);
    getAppointmentCountsByWeek(user.id, from, to).then(setWeekCounts).catch(() => {});
  }, [user, viewMode, fmt(weekDates[0])]);

  const monthDates = useMemo(() => getMonthDates(selectedDate), [selectedDate.getFullYear(), selectedDate.getMonth()]);

  useEffect(() => {
    if (!user || viewMode !== 'month') return;
    const nonNull = monthDates.filter((d): d is Date => d !== null);
    if (!nonNull.length) return;
    const from = fmt(nonNull[0]);
    const to = fmt(nonNull[nonNull.length - 1]);
    getAppointmentCountsByWeek(user.id, from, to).then(setMonthCounts).catch(() => {});
  }, [user, viewMode, selectedDate.getFullYear(), selectedDate.getMonth()]);

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

  async function handleDelete(apptId: string) {
    if (user) await deleteAppointment(apptId).catch(() => {});
    setAppointments(prev => prev.filter(a => a.id !== apptId));
  }

  const dayAppointments = appointments.filter(a => {
    if (filterStatuses.size > 0 && !filterStatuses.has(a.status)) return false;
    if (filterType !== 'all' && a.type !== filterType) return false;
    return true;
  });

  const apptLayout = useMemo(() => computeLayout(dayAppointments), [dayAppointments]);

  const DAY_KEYS: WorkingHoursKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function isOutsideWorkingHours(hour: number): boolean {
    const wh = professional?.workingHours;
    if (!wh) return false;
    const key = DAY_KEYS[selectedDate.getDay()];
    const day = wh[key];
    if (!day || !day.enabled) return true;
    const startH = parseInt(day.start.split(':')[0], 10);
    const endH = parseInt(day.end.split(':')[0], 10);
    return hour < startH || hour >= endH;
  }

  function navigate(dir: -1 | 1) {
    const d = new Date(selectedDate);
    if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    setSelectedDate(d);
  }

  const headerLabel = viewMode === 'month'
    ? selectedDate.toLocaleString(getLocale(), { month: 'long', year: 'numeric' })
    : viewMode === 'day'
      ? formatScheduleDayHeader(selectedDate)
      : formatScheduleWeekHeader(weekDates[0], weekDates[6]);

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
          <TouchableOpacity onPress={() => setShowWhatsApp(true)} style={styles.todayBtn}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
          </TouchableOpacity>
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
          <TouchableOpacity onPress={loadAppointments} style={styles.todayBtn} disabled={loading}>
            {loading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.todayBtn}>
            <Ionicons name="today-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              onPress={() => setViewMode('day')}
              style={[styles.toggleBtn, viewMode === 'day' && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'day' && styles.toggleTextActive]}>{t('schedule.day')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('week')}
              style={[styles.toggleBtn, viewMode === 'week' && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>{t('schedule.week')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('month')}
              style={[styles.toggleBtn, viewMode === 'month' && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'month' && styles.toggleTextActive]}>{t('schedule.month' as any)}</Text>
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
                <Text style={[styles.weekDayName, isSelected && styles.weekDayTextSelected]}>{formatWeekdayShort(d).toUpperCase().replace('.', '')}</Text>
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

      {/* Month grid */}
      {viewMode === 'month' && (
        <ScrollView style={styles.grid} showsVerticalScrollIndicator={false}>
          <View style={styles.monthDayNames}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={styles.monthDayName}>{d}</Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {monthDates.map((d, i) => {
              if (!d) return <View key={`pad-${i}`} style={styles.monthCell} />;
              const dStr = fmt(d);
              const isToday = dStr === fmt(new Date());
              const isSelected = dStr === dateStr;
              const count = user
                ? (monthCounts[dStr] ?? 0)
                : MOCK_APPOINTMENTS.filter(a => a.date === dStr && a.status !== 'blocked').length;
              return (
                <TouchableOpacity
                  key={dStr}
                  style={[styles.monthCell, isSelected && styles.monthCellSelected, isToday && !isSelected && styles.monthCellToday]}
                  onPress={() => { setSelectedDate(d); setViewMode('day'); }}
                >
                  <Text style={[styles.monthCellNum, isSelected && styles.monthCellNumSelected, isToday && !isSelected && { color: Colors.primary }]}>
                    {d.getDate()}
                  </Text>
                  {count > 0 ? (
                    <View style={[styles.monthCountBadge, isSelected && styles.monthCountBadgeSelected]}>
                      <Text style={[styles.monthCountText, isSelected && styles.monthCountTextSelected]}>{count}</Text>
                    </View>
                  ) : <View style={{ height: 14 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* Time grid */}
      {viewMode !== 'month' && <ScrollView style={styles.grid} showsVerticalScrollIndicator={false}>
        <View style={{ position: 'relative' }}>
          {HOURS.map(hour => {
            const dimmed = isOutsideWorkingHours(hour);
            return (
              <View key={hour} style={[styles.hourRow, dimmed && styles.hourRowDimmed]}>
                <Text style={[styles.hourLabel, dimmed && styles.hourLabelDimmed]}>
                  {String(hour).padStart(2, '0')}:00
                </Text>
                <View style={styles.hourLine} />
              </View>
            );
          })}

          {/* Appointment blocks */}
          <View style={styles.apptLayer}>
            {dayAppointments.map(appt => {
              const { col, totalCols } = apptLayout[appt.id] ?? { col: 0, totalCols: 1 };
              return (
                <AppointmentBlock
                  key={appt.id}
                  appt={appt}
                  onPress={() => setSelectedAppt(appt)}
                  col={col}
                  totalCols={totalCols}
                />
              );
            })}
          </View>
        </View>

        {/* Status legend */}
        <View style={styles.legend}>
          {([
            { key: 'scheduled', color: Colors.warning },
            { key: 'confirmed', color: Colors.primary },
            { key: 'completed', color: Colors.success },
            { key: 'cancelled', color: Colors.danger },
            { key: 'late', color: Colors.late },
            { key: 'absent', color: Colors.absent },
            { key: 'blocked', color: Colors.blocked },
          ] as const).map(({ key, color }) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>{t(`schedule.legend.${key}` as any)}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>}

      {/* FAB group — hidden for patients */}
      {!isPatient && (
        <View style={styles.fabGroup}>
          <TouchableOpacity style={styles.blockBtn} onPress={() => setShowBlockTime(true)}>
            <Ionicons name="remove-circle-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.blockBtnText}>{t('schedule.blockTime')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => setShowNewAppt(true)}>
            <Ionicons name="add" size={26} color="#fff" />
            <Text style={styles.fabText}>{t('schedule.newAppointment')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <AppointmentModal
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onMarkPaid={handleMarkPaid}
        onStatusChange={handleStatusChange}
        onEdit={(appt) => { setSelectedAppt(null); setEditingAppt(appt); }}
        onAmountUpdated={(id, amount) => setAppointments(prev => prev.map(a => a.id === id ? { ...a, paymentAmount: amount } : a))}
        onDelete={handleDelete}
        pixKey={professional?.pixKey}
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

      <WhatsAppRemindersModal
        visible={showWhatsApp}
        onClose={() => setShowWhatsApp(false)}
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
              <Text style={styles.filterTitle}>{t('schedule.filters')}</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.filterClear}>{t('common.clear')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.filterLabel}>{t('schedule.status')}</Text>
            <View style={styles.filterPillRow}>
              {(['scheduled', 'confirmed', 'completed', 'cancelled', 'late', 'absent'] as Appointment['status'][]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterPill, filterStatuses.has(s) && styles.filterPillActive]}
                  onPress={() => toggleStatus(s)}
                >
                  <Text style={[styles.filterPillText, filterStatuses.has(s) && styles.filterPillTextActive]}>
                    {t(`status.${s}` as any)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterLabel}>{t('schedule.type')}</Text>
            <View style={styles.filterPillRow}>
              {(['all', 'in-person', 'online'] as const).map(typeOpt => (
                <TouchableOpacity
                  key={typeOpt}
                  style={[styles.filterPill, filterType === typeOpt && styles.filterPillActive]}
                  onPress={() => setFilterType(typeOpt)}
                >
                  <Text style={[styles.filterPillText, filterType === typeOpt && styles.filterPillTextActive]}>
                    {typeOpt === 'all' ? t('schedule.allTypes') : typeOpt === 'in-person' ? t('apptType.inPerson') : t('apptType.online')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={() => setShowFilter(false)}>
              <Text style={styles.filterApplyText}>{t('common.apply')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
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
  hourRowDimmed: { backgroundColor: '#F0F2F5' },
  hourLabelDimmed: { color: Colors.border },
  hourLine: { flex: 1, height: 1, backgroundColor: Colors.border, marginTop: 7 },
  apptLayer: { position: 'absolute', left: 56, right: 8, top: 0 },
  apptBlock: {
    position: 'absolute',
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  apptText: { fontSize: 12, fontWeight: '600' },
  apptSubText: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
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
  monthDayNames: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  monthDayName: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4, paddingTop: 4 },
  monthCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 8 },
  monthCellSelected: { backgroundColor: Colors.primary },
  monthCellToday: { borderWidth: 1.5, borderColor: Colors.primary },
  monthCellNum: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  monthCellNumSelected: { color: '#fff' },
  monthCountBadge: { marginTop: 2, minWidth: 16, height: 14, borderRadius: 7, backgroundColor: Colors.primary + '25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  monthCountBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.35)' },
  monthCountText: { fontSize: 9, fontWeight: '700', color: Colors.primary },
  monthCountTextSelected: { color: '#fff' },
});
