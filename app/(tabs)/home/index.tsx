import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Appointment, Patient, Professional } from '@/lib/types';
import { MOCK_APPOINTMENTS, MOCK_PATIENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, getPendingPayments, getPatients, getProfessional,
} from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t, tn } from '@/lib/i18n';
import { formatHomeDateHeader, formatCurrencyWhole, formatCurrency, formatDuration } from '@/lib/locale-utils';

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

function statusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return Colors.primary;
    case 'completed': return Colors.success;
    case 'cancelled': return Colors.danger;
    default: return Colors.warning;
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return t('home.morning');
  if (h < 18) return t('home.afternoon');
  return t('home.evening');
}

export default function HomeScreen() {
  const { user } = useAuth();
  const today = new Date();
  const dateStr = fmt(today);

  const [professional, setProfessional] = useState<Professional | null>(null);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Appointment[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!user) {
      const all = MOCK_APPOINTMENTS.filter(a => a.date === dateStr && a.status !== 'blocked');
      setTodayAppts(all);
      setPendingPayments(MOCK_APPOINTMENTS.filter(a => a.paymentStatus === 'pending' && a.status !== 'blocked'));
      setRecentPatients(MOCK_PATIENTS.slice(0, 5));
      setLoading(false);
      return;
    }
    try {
      const [prof, appts, pending, patients] = await Promise.all([
        getProfessional(user.id),
        getAppointmentsByDate(user.id, dateStr),
        getPendingPayments(user.id),
        getPatients(user.id),
      ]);
      setProfessional(prof);
      setTodayAppts(appts.filter(a => a.status !== 'blocked'));
      setPendingPayments(pending);
      setRecentPatients(patients.slice(0, 5));
    } catch {
      setTodayAppts(MOCK_APPOINTMENTS.filter(a => a.date === dateStr && a.status !== 'blocked'));
      setPendingPayments(MOCK_APPOINTMENTS.filter(a => a.paymentStatus === 'pending' && a.status !== 'blocked'));
      setRecentPatients(MOCK_PATIENTS.slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, [user, dateStr]);

  useEffect(() => { load(); }, [load]);

  const doctorName = professional?.fullName ?? user?.email?.split('@')[0] ?? 'Doctor';
  const upcomingAppts = todayAppts
    .filter(a => {
      const [h, m] = a.startTime.split(':').map(Number);
      const apptMin = h * 60 + m;
      const nowMin = today.getHours() * 60 + today.getMinutes();
      return apptMin >= nowMin - 15;
    })
    .slice(0, 4);

  const completedToday = todayAppts.filter(a => a.status === 'completed').length;
  const pendingTotal = pendingPayments.reduce((s, a) => s + (a.paymentAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.doctorName}>Dr. {doctorName.split(' ')[0]}</Text>
        </View>
        <Text style={styles.headerDate}>{formatHomeDateHeader(today)}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={Colors.primary} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }}>

          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderTopColor: Colors.primary }]}>
              <Text style={styles.summaryNum}>{todayAppts.length}</Text>
              <Text style={styles.summaryLabel}>{t('home.today')}</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
              <Text style={[styles.summaryNum, { color: Colors.success }]}>{completedToday}</Text>
              <Text style={styles.summaryLabel}>{t('home.done')}</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: Colors.warning }]}>
              <Text style={[styles.summaryNum, { color: Colors.warning }]}>{pendingPayments.length}</Text>
              <Text style={styles.summaryLabel}>{t('home.unpaid')}</Text>
            </View>
            <TouchableOpacity style={[styles.summaryCard, { borderTopColor: Colors.danger }]} onPress={() => router.push('/(tabs)/payments')}>
              <Text style={[styles.summaryNum, { color: Colors.danger, fontSize: 13 }]}>{formatCurrencyWhole(pendingTotal)}</Text>
              <Text style={styles.summaryLabel}>{t('home.pendingAmount')}</Text>
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(tabs)/schedule')}>
              <View style={[styles.quickIcon, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.quickLabel}>{t('tab.schedule')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(tabs)/patients')}>
              <View style={[styles.quickIcon, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="people-outline" size={20} color={Colors.success} />
              </View>
              <Text style={styles.quickLabel}>{t('tab.patients')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(tabs)/payments')}>
              <View style={[styles.quickIcon, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="card-outline" size={20} color={Colors.warning} />
              </View>
              <Text style={styles.quickLabel}>{t('tab.payments')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(tabs)/settings')}>
              <View style={[styles.quickIcon, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="settings-outline" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.quickLabel}>{t('tab.settings')}</Text>
            </TouchableOpacity>
          </View>

          {/* Today's appointments */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.todayAppointments')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
                <Text style={styles.seeAll}>{t('common.seeAll')}</Text>
              </TouchableOpacity>
            </View>

            {upcomingAppts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {todayAppts.length > 0 ? t('home.allDone') : t('home.noAppointments')}
                </Text>
              </View>
            ) : (
              upcomingAppts.map(appt => (
                <TouchableOpacity
                  key={appt.id}
                  style={styles.apptCard}
                  onPress={() => router.push('/(tabs)/schedule')}
                >
                  <View style={[styles.apptTimeBadge, { backgroundColor: statusColor(appt.status) + '18' }]}>
                    <Text style={[styles.apptTime, { color: statusColor(appt.status) }]}>{appt.startTime}</Text>
                    <Text style={[styles.apptDur, { color: statusColor(appt.status) }]}>{formatDuration(appt.durationMinutes)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.apptName} numberOfLines={1}>{appt.patientName}</Text>
                    <Text style={styles.apptType} numberOfLines={1}>
                      {appt.consultationType} · {t(appt.type === 'online' ? 'apptType.online' : 'apptType.inPerson')}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(appt.status) }]} />
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Recent patients */}
          {recentPatients.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('home.recentPatients')}</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/patients')}>
                  <Text style={styles.seeAll}>{t('common.seeAll')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {recentPatients.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.patientChip}
                    onPress={() => router.push('/(tabs)/patients')}
                  >
                    <View style={styles.patientChipAvatar}>
                      <Text style={styles.patientChipInitial}>{p.fullName[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.patientChipName} numberOfLines={1}>{p.fullName.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Pending payments callout */}
          {pendingPayments.length > 0 && (
            <TouchableOpacity style={styles.pendingCallout} onPress={() => router.push('/(tabs)/payments')}>
              <View style={styles.pendingCalloutLeft}>
                <Ionicons name="alert-circle-outline" size={22} color={Colors.warning} />
                <View>
                  <Text style={styles.pendingCalloutTitle}>
                    {tn('home.pendingPayments', pendingPayments.length, { n: pendingPayments.length })}
                  </Text>
                  <Text style={styles.pendingCalloutSub}>
                    {t('home.toCollect', { amount: formatCurrency(pendingTotal) })}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.warning} />
            </TouchableOpacity>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  doctorName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  headerDate: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  summaryNum: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, alignItems: 'center', gap: 8 },
  quickIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  seeAll: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  apptCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  apptTimeBadge: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  apptTime: { fontSize: 13, fontWeight: '800' },
  apptDur: { fontSize: 10, fontWeight: '500' },
  apptName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  apptType: { fontSize: 12, color: Colors.textSecondary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  emptyCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 24, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  patientChip: { alignItems: 'center', gap: 6, width: 60 },
  patientChipAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  patientChipInitial: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  patientChipName: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', textAlign: 'center' },

  pendingCallout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.warning + '14', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.warning + '40',
  },
  pendingCalloutLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pendingCalloutTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  pendingCalloutSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
