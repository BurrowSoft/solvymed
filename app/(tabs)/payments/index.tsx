import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';

const pending = MOCK_APPOINTMENTS.filter(a => a.paymentStatus === 'pending' && a.status !== 'blocked');
const paid = MOCK_APPOINTMENTS.filter(a => a.paymentStatus === 'paid');
const totalPending = pending.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);
const totalPaid = paid.reduce((sum, a) => sum + (a.paymentAmount ?? 0), 0);

export default function PaymentsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payments</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Summary cards */}
        <View style={styles.row}>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.warning }]}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryAmount, { color: Colors.warning }]}>
              R$ {totalPending.toFixed(2)}
            </Text>
            <Text style={styles.summaryCount}>{pending.length} appointment(s)</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
            <Text style={styles.summaryLabel}>Received</Text>
            <Text style={[styles.summaryAmount, { color: Colors.success }]}>
              R$ {totalPaid.toFixed(2)}
            </Text>
            <Text style={styles.summaryCount}>{paid.length} appointment(s)</Text>
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
                <Text style={styles.paymentAmount}>R$ {appt.paymentAmount?.toFixed(2)}</Text>
                <TouchableOpacity style={styles.markPaidBtn}>
                  <Text style={styles.markPaidText}>Mark paid</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Paid */}
        <Text style={styles.sectionTitle}>Received</Text>
        {paid.map(appt => (
          <View key={appt.id} style={[styles.paymentCard, styles.paidCard]}>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentPatient}>{appt.patientName}</Text>
              <Text style={styles.paymentMeta}>{appt.date} · {appt.startTime}</Text>
            </View>
            <View style={styles.paymentRight}>
              <Text style={[styles.paymentAmount, { color: Colors.success }]}>
                R$ {appt.paymentAmount?.toFixed(2)}
              </Text>
              <View style={styles.paidBadge}>
                <Ionicons name="checkmark" size={12} color={Colors.success} />
                <Text style={styles.paidBadgeText}>Paid</Text>
              </View>
            </View>
          </View>
        ))}

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
