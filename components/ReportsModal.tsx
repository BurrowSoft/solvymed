import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { getAppointmentsByWeek } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';
import { formatCurrency } from '@/lib/locale-utils';
import { useStyles } from '@/lib/use-styles';

type Period = 'week' | 'month' | 'lastMonth' | 'all';
type ConvenioFilter = 'all' | 'private' | 'insurance';

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

function getRange(period: Period): { from: string; to: string } {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (period === 'lastMonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(from), to: fmt(to) };
  }
  // all — last 12 months
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  return { from: fmt(from), to: fmt(now) };
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ReportsModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [convenio, setConvenio] = useState<ConvenioFilter>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    const { from, to } = getRange(period);
    getAppointmentsByWeek(user.id, from, to)
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [visible, period, user]);

  const filtered = appointments.filter(a => {
    if (a.status === 'blocked') return false;
    if (convenio === 'private') return a.paymentType === 'private';
    if (convenio === 'insurance') return a.paymentType === 'insurance';
    return true;
  });

  const uniquePatients = new Set(filtered.map(a => a.patientId)).size;
  const totalRevenue = filtered.reduce((s, a) => s + (a.paymentAmount ?? 0), 0);
  const paidRevenue = filtered.filter(a => a.paymentStatus === 'paid').reduce((s, a) => s + (a.paymentAmount ?? 0), 0);
  const pendingRevenue = totalRevenue - paidRevenue;

  const statusCounts: Partial<Record<Appointment['status'], number>> = {};
  for (const a of filtered) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  const PERIODS: { key: Period; labelKey: string }[] = [
    { key: 'week', labelKey: 'reports.periodWeek' },
    { key: 'month', labelKey: 'reports.periodMonth' },
    { key: 'lastMonth', labelKey: 'reports.periodLastMonth' },
    { key: 'all', labelKey: 'reports.periodAll' },
  ];

  const STATUS_COLORS: Partial<Record<Appointment['status'], string>> = {
    scheduled: Colors.warning,
    confirmed: Colors.primary,
    completed: Colors.success,
    cancelled: Colors.danger,
    late: Colors.late,
    absent: Colors.absent,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('reports.title' as any)}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Period filter */}
          <Text style={styles.sectionLabel}>{t('reports.period' as any)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {PERIODS.map(({ key, labelKey }) => (
              <TouchableOpacity
                key={key}
                style={[styles.pill, period === key && styles.pillActive]}
                onPress={() => setPeriod(key)}
              >
                <Text style={[styles.pillText, period === key && styles.pillTextActive]}>
                  {t(labelKey as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Convenio filter */}
          <Text style={styles.sectionLabel}>{t('reports.convenio' as any)}</Text>
          <View style={styles.pillRow}>
            {(['all', 'private', 'insurance'] as ConvenioFilter[]).map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.pill, convenio === c && styles.pillActive]}
                onPress={() => setConvenio(c)}
              >
                <Text style={[styles.pillText, convenio === c && styles.pillTextActive]}>
                  {c === 'all' ? t('reports.convenioAll' as any) : c === 'private' ? t('settings.financial.private') : t('settings.financial.insurance')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>{t('reports.noData' as any)}</Text>
            </View>
          ) : (
            <>
              {/* Summary cards */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNum}>{uniquePatients}</Text>
                  <Text style={styles.summaryLabel}>{t('reports.patients' as any)}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryNum}>{filtered.length}</Text>
                  <Text style={styles.summaryLabel}>{t('reports.appointments' as any)}</Text>
                </View>
              </View>

              {/* Revenue */}
              <Text style={styles.sectionLabel}>{t('reports.revenue' as any)}</Text>
              <View style={styles.revenueCard}>
                <View style={styles.revenueRow}>
                  <Text style={styles.revLabel}>Total</Text>
                  <Text style={styles.revTotal}>{formatCurrency(totalRevenue)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.revenueRow}>
                  <Text style={styles.revLabel}>{t('appt.paid')}</Text>
                  <Text style={[styles.revValue, { color: Colors.success }]}>{formatCurrency(paidRevenue)}</Text>
                </View>
                <View style={styles.revenueRow}>
                  <Text style={styles.revLabel}>{t('home.unpaid')}</Text>
                  <Text style={[styles.revValue, { color: Colors.warning }]}>{formatCurrency(pendingRevenue)}</Text>
                </View>
              </View>

              {/* By status */}
              <Text style={styles.sectionLabel}>{t('reports.byStatus' as any)}</Text>
              <View style={styles.statusCard}>
                {(Object.entries(statusCounts) as [Appointment['status'], number][]).map(([s, count]) => (
                  <View key={s} style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[s] ?? Colors.textMuted }]} />
                    <Text style={styles.statusLabel}>{t(`status.${s}` as any)}</Text>
                    <Text style={styles.statusCount}>{count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 12,
  },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.primary, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 16,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  summaryNum: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  revenueCard: {
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 8, marginBottom: 4,
  },
  revenueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revLabel: { fontSize: 13, color: Colors.textSecondary },
  revTotal: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  revValue: { fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.border },
  statusCard: {
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  statusCount: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
});
