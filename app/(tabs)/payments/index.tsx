import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import { getPendingPayments, getPaidPayments, updatePaymentStatus, getRevenueByMonth } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t, tn } from '@/lib/i18n';
import { formatCurrency, formatCurrencyWhole, formatMonthYear, formatTime, translateConsultType } from '@/lib/locale-utils';
import { useStyles } from '@/lib/use-styles';

type DateFilter = 'week' | 'month' | 'last_month' | 'all';

const FILTERS: { key: DateFilter; labelKey: string }[] = [
  { key: 'week', labelKey: 'payments.filter.week' },
  { key: 'month', labelKey: 'payments.filter.month' },
  { key: 'last_month', labelKey: 'payments.filter.lastMonth' },
  { key: 'all', labelKey: 'payments.filter.all' },
];

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function getDateRange(filter: DateFilter): { from?: string; to?: string } {
  const today = new Date();
  if (filter === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { from: fmt(start), to: fmt(today) };
  }
  if (filter === 'month') {
    return {
      from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
      to: fmt(today),
    };
  }
  if (filter === 'last_month') {
    const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(lm), to: fmt(end) };
  }
  return {};
}

export default function PaymentsScreen() {
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const [filter, setFilter] = useState<DateFilter>('month');
  const [pending, setPending] = useState<Appointment[]>([]);
  const [paid, setPaid] = useState<Appointment[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; paid: number; pending: number; count: number }[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [accountActive, setAccountActive] = useState(true);
  const [installmentLimit, setInstallmentLimit] = useState(12);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [monthAppts, setMonthAppts] = useState<Record<string, Appointment[]>>({});
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(filter);
    if (!user) {
      const all = MOCK_APPOINTMENTS.filter(a => a.status !== 'blocked');
      setPending(all.filter(a => a.paymentStatus === 'pending'));
      setPaid(all.filter(a => a.paymentStatus === 'paid'));
      setLoading(false);
      return;
    }
    try {
      const [p, d] = await Promise.all([
        getPendingPayments(user.id, from, to),
        getPaidPayments(user.id, from, to),
      ]);
      setPending(p);
      setPaid(d);
    } catch {
      const all = MOCK_APPOINTMENTS.filter(a => a.status !== 'blocked');
      setPending(all.filter(a => a.paymentStatus === 'pending'));
      setPaid(all.filter(a => a.paymentStatus === 'paid'));
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!user) return;
    getRevenueByMonth(user.id).then(setRevenue).catch(() => {});
  }, [user]);

  async function handleMarkPaid(apptId: string) {
    if (user) await updatePaymentStatus(apptId, 'paid');
    const appt = pending.find(a => a.id === apptId);
    if (appt) {
      setPending(prev => prev.filter(a => a.id !== apptId));
      setPaid(prev => [{ ...appt, paymentStatus: 'paid' }, ...prev]);
    }
    if (user) getRevenueByMonth(user.id).then(setRevenue).catch(() => {});
  }

  function handleRevertPayment(apptId: string) {
    Alert.alert(
      t('payments.revertTitle'),
      t('payments.revertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('payments.revert'),
          style: 'destructive',
          onPress: async () => {
            if (user) await updatePaymentStatus(apptId, 'pending');
            const appt = paid.find(a => a.id === apptId);
            if (appt) {
              setPaid(prev => prev.filter(a => a.id !== apptId));
              setPending(prev => [{ ...appt, paymentStatus: 'pending' }, ...prev]);
            }
            if (user) getRevenueByMonth(user.id).then(setRevenue).catch(() => {});
          },
        },
      ],
    );
  }

  async function handleToggleMonth(month: string) {
    if (expandedMonths.has(month)) {
      setExpandedMonths(prev => { const s = new Set(prev); s.delete(month); return s; });
      return;
    }
    setExpandedMonths(prev => new Set(prev).add(month));
    if (monthAppts[month] || !user) return;
    setLoadingMonth(month);
    try {
      const [year, m] = month.split('-').map(Number);
      const lastDay = new Date(year, m, 0).getDate();
      const from = `${month}-01`;
      const to = `${month}-${String(lastDay).padStart(2, '0')}`;
      const [paidData, pendingData] = await Promise.all([
        getPaidPayments(user.id, from, to),
        getPendingPayments(user.id, from, to),
      ]);
      const all = [...paidData, ...pendingData].sort((a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );
      setMonthAppts(prev => ({ ...prev, [month]: all }));
    } catch {
      setMonthAppts(prev => ({ ...prev, [month]: [] }));
    } finally {
      setLoadingMonth(null);
    }
  }

  const totalPending = pending.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);
  const totalPaid = paid.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('payments.title')}</Text>
      </View>

      {/* Date filter */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}>
              {t(f.labelKey as any)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Payment account card */}
        <View style={styles.accountCard}>
          <View style={styles.accountCardLeft}>
            <View style={styles.accountIconWrap}>
              <Ionicons name="card-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={styles.accountTitle}>{t('payments.account')}</Text>
              <View style={styles.accountStatusRow}>
                <View style={[styles.accountDot, { backgroundColor: accountActive ? Colors.success : Colors.textMuted }]} />
                <Text style={[styles.accountStatus, { color: accountActive ? Colors.success : Colors.textMuted }]}>
                  {accountActive ? t('payments.active') : t('payments.inactive')}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert(
              accountActive ? t('payments.deactivateTitle') : t('payments.activateTitle'),
              accountActive ? t('payments.deactivateMessage') : t('payments.activateMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: accountActive ? t('payments.deactivate') : t('payments.activate'),
                  style: accountActive ? 'destructive' : 'default',
                  onPress: () => setAccountActive(v => !v),
                },
              ],
            )}
          >
            <Text style={[styles.accountToggleText, { color: accountActive ? Colors.danger : Colors.primary }]}>
              {accountActive ? t('payments.deactivate') : t('payments.activate')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Installment limit card */}
        <View style={styles.accountCard}>
          <View style={styles.accountCardLeft}>
            <View style={styles.accountIconWrap}>
              <Ionicons name="layers-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ gap: 2 }}>
              <Text style={styles.accountTitle}>{t('payments.installmentLimit')}</Text>
              <Text style={[styles.accountStatus, { color: Colors.textSecondary }]}>
                {tn('payments.maxInstallments', installmentLimit, { n: installmentLimit })}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity
              onPress={() => setInstallmentLimit(v => Math.max(1, v - 1))}
              style={styles.stepperBtn}
            >
              <Ionicons name="remove" size={16} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{installmentLimit}x</Text>
            <TouchableOpacity
              onPress={() => setInstallmentLimit(v => Math.min(24, v + 1))}
              style={styles.stepperBtn}
            >
              <Ionicons name="add" size={16} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary cards */}
        <View style={styles.row}>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.warning }]}>
            <Text style={styles.summaryLabel}>{t('payments.pending')}</Text>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.warning} style={{ marginVertical: 4 }} />
            ) : (
              <Text style={[styles.summaryAmount, { color: Colors.warning }]}>
                {formatCurrency(totalPending)}
              </Text>
            )}
            <Text style={styles.summaryCount}>{tn('payments.appointment', pending.length, { n: pending.length })}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
            <Text style={styles.summaryLabel}>{t('payments.received')}</Text>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.success} style={{ marginVertical: 4 }} />
            ) : (
              <Text style={[styles.summaryAmount, { color: Colors.success }]}>
                {formatCurrency(totalPaid)}
              </Text>
            )}
            <Text style={styles.summaryCount}>{tn('payments.appointment', paid.length, { n: paid.length })}</Text>
          </View>
        </View>

        {/* Pending payments */}
        <Text style={styles.sectionTitle}>{t('payments.pending')}</Text>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ paddingVertical: 32 }} />
        ) : pending.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
            <Text style={styles.emptyText}>{t('payments.allUpToDate')}</Text>
          </View>
        ) : (
          pending.map(appt => (
            <View key={appt.id} style={styles.paymentCard}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentPatient}>{appt.patientName}</Text>
                <Text style={styles.paymentMeta}>{appt.date} · {formatTime(appt.startTime)}</Text>
                <Text style={styles.paymentMeta}>{translateConsultType(appt.consultationType)}</Text>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentAmount}>
                  {appt.paymentAmount != null ? formatCurrency(appt.paymentAmount) : '—'}
                </Text>
                <TouchableOpacity style={styles.markPaidBtn} onPress={() => handleMarkPaid(appt.id)}>
                  <Text style={styles.markPaidText}>{t('payments.markPaid')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Paid */}
        {!loading && paid.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('payments.received')}</Text>
            {paid.map(appt => (
              <View key={appt.id} style={[styles.paymentCard, styles.paidCard]}>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentPatient}>{appt.patientName}</Text>
                  <Text style={styles.paymentMeta}>{appt.date} · {formatTime(appt.startTime)}</Text>
                </View>
                <View style={styles.paymentRight}>
                  <Text style={[styles.paymentAmount, { color: Colors.success }]}>
                    {appt.paymentAmount != null ? formatCurrency(appt.paymentAmount) : '—'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark" size={12} color={Colors.success} />
                      <Text style={styles.paidBadgeText}>{t('appt.paid')}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRevertPayment(appt.id)}
                      style={styles.revertBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="arrow-undo-outline" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Monthly report */}
        {revenue.length > 0 && (
          <View style={styles.reportContainer}>
            <TouchableOpacity
              style={styles.reportToggle}
              onPress={() => setShowReport(v => !v)}
            >
              <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
              <Text style={styles.reportToggleText}>{t('payments.monthlyReport')}</Text>
              <Ionicons
                name={showReport ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textSecondary}
                style={{ marginLeft: 'auto' }}
              />
            </TouchableOpacity>

            {showReport && revenue.map((row, rowIdx) => {
              const total = row.paid + row.pending;
              const barWidth = total > 0 ? row.paid / total : 0;
              const isExpanded = expandedMonths.has(row.month);
              const isLoadingThis = loadingMonth === row.month;
              const appts = monthAppts[row.month] ?? [];
              return (
                <View key={row.month} style={[styles.reportRow, rowIdx === 0 && styles.reportRowFirst]}>
                  {/* Tappable header */}
                  <TouchableOpacity
                    style={styles.reportRowHeader}
                    onPress={() => handleToggleMonth(row.month)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.reportMonth}>{formatMonthYear(row.month)}</Text>
                    <Text style={styles.reportCount}>{tn('payments.appointment', row.count, { n: row.count })}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                      <Text style={styles.reportPaid}>{formatCurrencyWhole(row.paid)}</Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={Colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Bar chart */}
                  <View style={styles.reportBar}>
                    <View style={[styles.reportBarFill, { flex: barWidth }]} />
                    <View style={{ flex: 1 - barWidth }} />
                  </View>
                  {row.pending > 0 && (
                    <Text style={styles.reportPending}>{t('payments.pendingReport', { amount: formatCurrencyWhole(row.pending) })}</Text>
                  )}

                  {/* Expanded appointment list */}
                  {isExpanded && (
                    <View style={styles.monthDetailWrap}>
                      {isLoadingThis ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 12 }} />
                      ) : appts.length === 0 ? (
                        <Text style={styles.monthDetailEmpty}>{t('payments.allUpToDate')}</Text>
                      ) : (
                        appts.map((appt, i) => (
                          <View
                            key={appt.id}
                            style={[styles.monthApptRow, i < appts.length - 1 && styles.monthApptRowBorder]}
                          >
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                              <Text style={styles.monthApptName} numberOfLines={1}>{appt.patientName}</Text>
                              <Text style={styles.monthApptMeta} numberOfLines={1}>
                                {appt.date} · {formatTime(appt.startTime)} · {translateConsultType(appt.consultationType)}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 2 }}>
                              <Text style={[styles.monthApptAmount, { color: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]}>
                                {appt.paymentAmount != null ? formatCurrency(appt.paymentAmount) : '—'}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }} />
                                <Text style={[styles.monthApptStatus, { color: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }]}>
                                  {appt.paymentStatus === 'paid' ? t('appt.paid') : t('payments.pending')}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                      {/* Collapse button at bottom */}
                      <TouchableOpacity
                        style={styles.collapseRow}
                        onPress={() => setExpandedMonths(prev => { const s = new Set(prev); s.delete(row.month); return s; })}
                      >
                        <Ionicons name="chevron-up" size={13} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterPill: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterPillActive: { borderBottomColor: Colors.primary },
  filterPillText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', textAlign: 'center' },
  filterPillTextActive: { color: Colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    borderLeftWidth: 4, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  summaryLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  summaryAmount: { fontSize: 20, fontWeight: '700' },
  summaryCount: { fontSize: 11, color: Colors.textMuted },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  paymentCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  paidCard: { opacity: 0.7 },
  paymentInfo: { flex: 1, gap: 2 },
  paymentPatient: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  paymentMeta: { fontSize: 12, color: Colors.textSecondary },
  paymentRight: { alignItems: 'flex-end', gap: 6 },
  paymentAmount: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  markPaidBtn: { backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  markPaidText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  revertBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paidBadgeText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  reportContainer: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  reportToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14,
  },
  reportToggleText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  reportRow: {
    padding: 14, gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  reportRowFirst: { borderTopWidth: 0 },
  reportRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reportMonth: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  reportCount: { fontSize: 12, color: Colors.textMuted },
  reportPaid: { fontSize: 14, fontWeight: '700', color: Colors.success },
  reportBar: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  reportBarFill: { backgroundColor: Colors.success, borderRadius: 3 },
  reportPending: { fontSize: 12, color: Colors.warning },
  monthDetailWrap: {
    marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 0,
  },
  monthDetailEmpty: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  monthApptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  monthApptRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  monthApptName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  monthApptMeta: { fontSize: 11, color: Colors.textSecondary },
  monthApptAmount: { fontSize: 13, fontWeight: '700' },
  monthApptStatus: { fontSize: 10, fontWeight: '600' },
  collapseRow: {
    marginTop: 6, paddingVertical: 6, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  accountCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  accountCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  accountTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  accountStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accountDot: { width: 7, height: 7, borderRadius: 4 },
  accountStatus: { fontSize: 12, fontWeight: '600' },
  accountToggleText: { fontSize: 13, fontWeight: '600' },
  stepperBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, minWidth: 28, textAlign: 'center' },
});
