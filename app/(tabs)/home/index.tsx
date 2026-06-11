import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Image, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Appointment, MedicalRecord, Patient, Prescription, Professional } from '@/lib/types';
import { MOCK_APPOINTMENTS, MOCK_PATIENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, getPendingPayments, getPatients, getProfessional,
  getPatientAppointments, getRecords, getPrescriptions,
} from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { useRole } from '@/lib/role-context';
import { linkByInviteCode } from '@/lib/services';
import { t, tn } from '@/lib/i18n';
import { formatHomeDateHeader, formatCurrencyWhole, formatCurrency, formatDuration, formatTime, translateConsultType } from '@/lib/locale-utils';
import { useStyles } from '@/lib/use-styles';
import { ReportsModal } from '@/components/ReportsModal';
import { MassMessageModal } from '@/components/MassMessageModal';
import { BookAppointmentModal } from '@/components/BookAppointmentModal';

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

function statusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return Colors.primary;
    case 'completed': return Colors.success;
    case 'cancelled': return Colors.danger;
    case 'late': return Colors.late;
    case 'absent': return Colors.absent;
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
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const { role, linkedPatientId, refresh: refreshRole } = useRole();
  const today = new Date();
  const dateStr = fmt(today);

  const [professional, setProfessional] = useState<Professional | null>(null);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [pendingPayments, setPendingPayments] = useState<Appointment[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReports, setShowReports] = useState(false);
  const [showMassMsg, setShowMassMsg] = useState(false);

  // Patient-specific state
  const [myAppts, setMyAppts] = useState<Appointment[]>([]);
  const [myRecords, setMyRecords] = useState<MedicalRecord[]>([]);
  const [myPrescriptions, setMyPrescriptions] = useState<Prescription[]>([]);

  // Connect-to-clinic flow (unlinked patients)
  const [connectCode, setConnectCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showBookAppt, setShowBookAppt] = useState(false);

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

    if (role === 'patient' && linkedPatientId) {
      try {
        const future = new Date(today); future.setMonth(future.getMonth() + 3);
        const [appts, records, prescriptions] = await Promise.all([
          getPatientAppointments(linkedPatientId, dateStr, fmt(future)),
          getRecords(linkedPatientId),
          getPrescriptions(linkedPatientId),
        ]);
        setMyAppts(appts);
        setMyRecords(records);
        setMyPrescriptions(prescriptions);
      } catch {}
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleConnect() {
    if (!user || !connectCode.trim()) return;
    setConnecting(true);
    try {
      const result = await linkByInviteCode(user.id, connectCode.trim());
      if (!result) {
        Alert.alert('', t('patient.connectInvalid'));
      } else {
        await refreshRole(user.id);
        Alert.alert('', t('patient.connectSuccess', { name: result.patientName }));
      }
    } catch {
      Alert.alert('', t('patient.connectInvalid'));
    } finally {
      setConnecting(false);
    }
  }

  const { width } = useWindowDimensions();
  const showAvatar = width >= 360;
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
        <View style={styles.headerLeft}>
          {showAvatar && (
            <View style={styles.doctorAvatar}>
              {professional?.photoUrl ? (
                <Image source={{ uri: professional.photoUrl }} style={styles.doctorAvatarImg} />
              ) : (
                <Text style={styles.doctorAvatarInitial}>{doctorName[0]?.toUpperCase()}</Text>
              )}
            </View>
          )}
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.doctorName} numberOfLines={1}>
              Dr. {showAvatar ? doctorName : doctorName.split(' ')[0]}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Text style={styles.headerDate}>{formatHomeDateHeader(today)}</Text>
          {role === 'professional' && (
            <TouchableOpacity onPress={() => setShowMassMsg(true)} style={styles.reportBtn}>
              <Ionicons name="megaphone-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
          {role !== 'patient' && (
            <TouchableOpacity onPress={() => setShowReports(true)} style={styles.reportBtn}>
              <Ionicons name="bar-chart-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={Colors.primary} />
      ) : role === 'patient' && !linkedPatientId ? (
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <View style={styles.connectIcon}>
              <Ionicons name="link-outline" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.connectTitle}>{t('patient.connectTitle')}</Text>
            <Text style={styles.connectHint}>{t('patient.connectHint')}</Text>
          </View>
          <TextInput
            style={styles.connectInput}
            value={connectCode}
            onChangeText={v => setConnectCode(v.toUpperCase())}
            placeholder={t('patient.connectPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.connectBtn, (connecting || !connectCode.trim()) && { opacity: 0.6 }]}
            onPress={handleConnect}
            disabled={connecting || !connectCode.trim()}
          >
            {connecting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.connectBtnText}>{t('patient.connectBtn')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      ) : role === 'patient' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }}>
          {/* Next appointment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('patient.nextAppt')}</Text>
            {myAppts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>{t('patient.noAppt')}</Text>
              </View>
            ) : (
              myAppts.slice(0, 3).map(appt => (
                <View key={appt.id} style={styles.apptCard}>
                  <View style={[styles.apptTimeBadge, { backgroundColor: `${statusColor(appt.status)}18` }]}>
                    <Text style={[styles.apptTime, { color: statusColor(appt.status) }]}>{appt.date}</Text>
                    <Text style={[styles.apptDur, { color: statusColor(appt.status) }]}>{formatTime(appt.startTime)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.apptName} numberOfLines={1}>{appt.consultationType}</Text>
                    <Text style={styles.apptType}>{t(appt.type === 'online' ? 'apptType.online' : 'apptType.inPerson')}</Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(appt.status) }]} />
                </View>
              ))
            )}
          </View>

          {/* My records + prescriptions quick stats */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderTopColor: Colors.primary }]}>
              <Text style={styles.summaryNum}>{myRecords.length}</Text>
              <Text style={styles.summaryLabel}>{t('patient.myRecords')}</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
              <Text style={styles.summaryNum}>{myPrescriptions.length}</Text>
              <Text style={styles.summaryLabel}>{t('patient.myPrescriptions')}</Text>
            </View>
          </View>

          {/* Book appointment */}
          <TouchableOpacity style={styles.bookBtn} onPress={() => setShowBookAppt(true)}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={styles.bookBtnText}>{t('book.title')}</Text>
          </TouchableOpacity>
        </ScrollView>
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
              <Text style={[styles.summaryNum, { color: Colors.danger, fontSize: 13 }]}>{formatCurrency(pendingTotal)}</Text>
              <Text style={styles.summaryLabel}>{t('home.pendingAmount')}</Text>
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
                    <Text style={[styles.apptTime, { color: statusColor(appt.status) }]}>{formatTime(appt.startTime)}</Text>
                    <Text style={[styles.apptDur, { color: statusColor(appt.status) }]}>{formatDuration(appt.durationMinutes)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.apptName} numberOfLines={1}>{appt.patientName}</Text>
                    <Text style={styles.apptType} numberOfLines={1}>
                      {translateConsultType(appt.consultationType)} · {t(appt.type === 'online' ? 'apptType.online' : 'apptType.inPerson')}
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
      <ReportsModal visible={showReports} onClose={() => setShowReports(false)} />
      <MassMessageModal visible={showMassMsg} onClose={() => setShowMassMsg(false)} />
      {linkedPatientId && (
        <BookAppointmentModal
          visible={showBookAppt}
          onClose={() => setShowBookAppt(false)}
          patientId={linkedPatientId}
          patientName={user?.email ?? ''}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  doctorAvatar: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  doctorAvatarImg: { width: 42, height: 42, borderRadius: 21 },
  doctorAvatarInitial: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  greeting: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  doctorName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  headerDate: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  reportBtn: { padding: 4 },
  noLinkBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
  },
  noLinkText: {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20,
  },
  connectIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center',
  },
  connectTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  connectHint: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  connectInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, height: 56,
    fontSize: 22, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 6,
    textAlign: 'center',
  },
  connectBtn: {
    backgroundColor: Colors.primary, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  summaryNum: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

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

  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 14, height: 52,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  bookBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
