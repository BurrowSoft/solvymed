import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import { getPendingPayments, getPaidPayments, updatePaymentStatus } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

type DateFilter = 'week' | 'month' | 'last_month' | 'all';

const FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'all', label: 'All time' },
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
  const { user } = useAuth();
  const [filter, setFilter] = useState<DateFilter>('month');
  const [pending, setPending] = useState<Appointment[]>([]);
  const [paid, setPaid] = useState<Appointment[]>([]);

  const load = useCallback(async () => {
    const { from, to } = getDateRange(filter);
    if (!user) {
      const all = MOCK_APPOINTMENTS.filter(a => a.status !== 'blocked');
      setPending(all.filter(a => a.paymentStatus === 'pending'));
      setPaid(all.filter(a => a.paymentStatus === 'paid'));
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
    }
  }, [user, filter]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkPaid(apptId: string) {
    if (user) await updatePaymentStatus(apptId, 'paid');
    const appt = pending.find(a => a.id === apptId);
    if (appt) {
      setPending(prev => prev.filter(a => a.id !== apptId));
      setPaid(prev => [{ ...appt, paymentStatus: 'paid' }, ...prev]);
    }
  }

  const totalPending = pending.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);
  const totalPaid = paid.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payments</Text>
      </View>

      {/* Date filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Summary cards */}
        <View style={styles.row}>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.warning }]}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryAmount, { color: Colors.warning }]}>
              R$ {totalPending.toFixed(2)}
            </Text>
            <Text style={styles.summaryCount}>{pending.length} appointment{pending.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
            <Text style={styles.summaryLabel}>Received</Text>
            <Text style={[styles.summaryAmount, { color: Colors.success }]}>
              R$ {totalPaid.toFixed(2)}
            </Text>
            <Text style={styles.summaryCount}>{paid.length} appointment{paid.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Pending payments */}
        <Text style={styles.sectionTitle}>Pending</Text>
        {pending.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
            <Text style={styles.emptyText}>All payments up to date</Text>
          </View>
        ) : (
          pending.map(appt => (
            <View key={appt.id} style={styles.paymentCard}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentPatient}>{appt.patientName}</Text>
                <Text style={styles.paymentMeta}>{appt.date} · {appt.startTime}</Text>
                <Text style={styles.paymentMeta}>{appt.consultationType}</Text>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentAmount}>R$ {appt.paymentAmount?.toFixed(2) ?? '—'}</Text>
                <TouchableOpacity style={styles.markPaidBtn} onPress={() => handleMarkPaid(appt.id)}>
                  <Text style={styles.markPaidText}>Mark paid</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Paid */}
        {paid.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Received</Text>
            {paid.map(appt => (
              <View key={appt.id} style={[styles.paymentCard, styles.paidCard]}>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentPatient}>{appt.patientName}</Text>
                  <Text style={styles.paymentMeta}>{appt.date} · {appt.startTime}</Text>
                </View>
                <View style={styles.paymentRight}>
                  <Text style={[styles.paymentAmount, { color: Colors.success }]}>
                    R$ {appt.paymentAmount?.toFixed(2) ?? '—'}
                  </Text>
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark" size={12} color={Colors.success} />
                    <Text style={styles.paidBadgeText}>Paid</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  filterRow: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 52 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterPillTextActive: { color: '#fff', fontWeight: '600' },
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
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paidBadgeText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
