import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Image, useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Appointment, MedicalRecord, Patient, Prescription, Professional } from '@/lib/types';
import { MOCK_APPOINTMENTS, MOCK_PATIENTS } from '@/lib/mock-data';
import {
  getAppointmentsByDate, getPendingPayments, getPatients, getProfessional,
  getPatientAppointments, getRecords, getPrescriptions,
  getTentativeAppointmentsWithNewPatient, confirmBookingAndAddPatient,
  confirmBooking, rejectBooking, proposeNewTime,
} from '@/lib/services';
import { getMyBookings, acceptProposal, declineProposal } from '@/lib/booking-service';
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
  const [myRequests, setMyRequests] = useState<Appointment[]>([]);

  // Doctor booking requests
  const [bookingRequests, setBookingRequests] = useState<(Appointment & { isNewPatient: boolean })[]>([]);
  const [proposeId, setProposeId] = useState<string | null>(null);
  const [propDate, setPropDate] = useState('');
  const [propStart, setPropStart] = useState('');
  const [propEnd, setPropEnd] = useState('');
  const [propDateObj, setPropDateObj] = useState(new Date());
  const [propStartObj, setPropStartObj] = useState(new Date());
  const [propEndObj, setPropEndObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

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

    if (role === 'patient') {
      try {
        const future = new Date(today); future.setMonth(future.getMonth() + 3);
        const requests = await getMyBookings(user.id);
        setMyRequests(requests.filter(b => ['tentative', 'proposal'].includes(b.status)));
        if (linkedPatientId) {
          const [appts, records, prescriptions] = await Promise.all([
            getPatientAppointments(linkedPatientId, dateStr, fmt(future)),
            getRecords(linkedPatientId),
            getPrescriptions(linkedPatientId),
          ]);
          setMyAppts(appts.filter(a => !['tentative', 'proposal', 'rejected'].includes(a.status)));
          setMyRecords(records);
          setMyPrescriptions(prescriptions);
        }
      } catch {}
      setLoading(false);
      return;
    }

    try {
      const [prof, appts, pending, patients, requests] = await Promise.all([
        getProfessional(user.id),
        getAppointmentsByDate(user.id, dateStr),
        getPendingPayments(user.id),
        getPatients(user.id),
        getTentativeAppointmentsWithNewPatient(user.id),
      ]);
      setProfessional(prof);
      setTodayAppts(appts.filter(a => a.status !== 'blocked'));
      setPendingPayments(pending);
      setRecentPatients(patients.slice(0, 5));
      setBookingRequests(requests);
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
              {role !== 'patient' ? 'Dr. ' : ''}{showAvatar ? doctorName : doctorName.split(' ')[0]}
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
          {/* Pending / proposal requests */}
          {myRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('home.bookingRequests')}</Text>
              {myRequests.map(req => {
                const isProposal = req.status === 'proposal';
                return (
                  <View key={req.id} style={[styles.apptCard, { borderLeftWidth: 3, borderLeftColor: isProposal ? Colors.warning : Colors.primary }]}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.apptName}>{req.consultationType}</Text>
                        <View style={[styles.statusDot, { backgroundColor: isProposal ? Colors.warning : Colors.primary }]} />
                        <Text style={{ fontSize: 11, color: isProposal ? Colors.warning : Colors.primary, fontWeight: '600' }}>
                          {isProposal ? 'New time proposed' : 'Pending'}
                        </Text>
                      </View>
                      {isProposal && req.proposedDate ? (
                        <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                          Proposed: {req.proposedDate} {req.proposedStartTime}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                          {req.date} at {formatTime(req.startTime)}
                        </Text>
                      )}
                      {isProposal && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <TouchableOpacity
                            style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.success }]}
                            onPress={async () => {
                              try {
                                await acceptProposal(req.id);
                                await load();
                              } catch { Alert.alert('Error', 'Could not accept. Try again.'); }
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.danger }]}
                            onPress={async () => {
                              try {
                                await declineProposal(req.id);
                                await load();
                              } catch { Alert.alert('Error', 'Could not decline. Try again.'); }
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

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

          {/* Doctor booking requests */}
          {bookingRequests.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('home.bookingRequests')}{' '}
                  <Text style={{ color: Colors.primary, fontWeight: '700' }}>({bookingRequests.length})</Text>
                </Text>
              </View>
              {bookingRequests.map(req => (
                <View key={req.id} style={[styles.apptCard, { flexDirection: 'column', gap: 8, alignItems: 'stretch' }]}>
                  {/* Header row */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.apptName}>{req.patientName}</Text>
                        {req.isNewPatient && (
                          <View style={{ backgroundColor: '#ede9fe', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#7c3aed' }}>{t('home.newPatient')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.apptType}>{req.date} · {formatTime(req.startTime)}–{formatTime(req.endTime)}</Text>
                      <Text style={styles.apptType}>{req.consultationType}</Text>
                      {req.notes ? <Text style={{ fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' }}>{req.notes}</Text> : null}
                      {req.status === 'proposal' && (
                        <View style={{ backgroundColor: '#fef9c3', borderRadius: 10, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#a16207' }}>{t('home.waitingForResponse')}</Text>
                        </View>
                      )}
                    </View>
                    {/* Patient info toggle */}
                    <TouchableOpacity
                      style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.surface }}
                      onPress={() => setInfoId(infoId === req.id ? null : req.id)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.textSecondary }}>{t('home.info')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Patient info panel */}
                  {infoId === req.id && (
                    <View style={{ backgroundColor: Colors.background, borderRadius: 10, padding: 10, gap: 3 }}>
                      <Text style={{ fontSize: 12, color: Colors.textSecondary }}><Text style={{ fontWeight: '600' }}>{t('home.infoName')}:</Text> {req.patientName}</Text>
                      <Text style={{ fontSize: 12, color: Colors.textSecondary }}><Text style={{ fontWeight: '600' }}>{t('home.infoConsultation')}:</Text> {req.consultationType}</Text>
                      <Text style={{ fontSize: 12, color: Colors.textSecondary }}><Text style={{ fontWeight: '600' }}>{t('home.infoDate')}:</Text> {req.date} at {formatTime(req.startTime)}–{formatTime(req.endTime)}</Text>
                      {req.notes ? <Text style={{ fontSize: 12, color: Colors.textSecondary }}><Text style={{ fontWeight: '600' }}>{t('home.infoNotes')}:</Text> {req.notes}</Text> : null}
                      <Text style={{ fontSize: 12 }}>
                        <Text style={{ fontWeight: '600', color: Colors.textSecondary }}>{t('home.infoStatus')}: </Text>
                        {req.isNewPatient
                          ? <Text style={{ color: '#7c3aed', fontWeight: '600' }}>{t('home.notInList')}</Text>
                          : <Text style={{ color: Colors.success, fontWeight: '600' }}>{t('home.existingPatient')}</Text>}
                      </Text>
                    </View>
                  )}

                  {/* Action buttons — tentative only */}
                  {req.status === 'tentative' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        disabled={actionPending}
                        style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.primary }]}
                        onPress={async () => {
                          setActionPending(true);
                          try {
                            if (req.isNewPatient) {
                              await confirmBookingAndAddPatient(req.id, req.professionalId);
                            } else {
                              await confirmBooking(req.id);
                            }
                            await load();
                          } catch {
                            Alert.alert('', t('home.errConfirm'));
                          } finally {
                            setActionPending(false);
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('home.confirm')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={actionPending}
                        style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.warning }]}
                        onPress={() => {
                          setProposeId(proposeId === req.id ? null : req.id);
                          setPropDate(''); setPropStart(''); setPropEnd('');
                          setPropDateObj(new Date()); setPropStartObj(new Date()); setPropEndObj(new Date());
                          setShowDatePicker(false); setShowStartPicker(false); setShowEndPicker(false);
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('home.proposeTime')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={actionPending}
                        style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.danger }]}
                        onPress={() => {
                          setActionPending(true);
                          rejectBooking(req.id)
                            .then(() => load())
                            .catch(() => Alert.alert('', t('home.errReject')))
                            .finally(() => setActionPending(false));
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('home.reject')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Inline propose form */}
                  {proposeId === req.id && (
                    <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, borderWidth: 1, borderColor: '#fde68a', padding: 10, gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>{t('home.proposeNewTime')}</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, justifyContent: 'center' }}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Text style={{ fontSize: 14, color: propDate ? Colors.textPrimary : Colors.textMuted }}>
                          {propDate || t('home.pickDate')}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, justifyContent: 'center' }}
                          onPress={() => setShowStartPicker(true)}
                        >
                          <Text style={{ fontSize: 14, color: propStart ? Colors.textPrimary : Colors.textMuted }}>
                            {propStart || t('home.pickStart')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, justifyContent: 'center' }}
                          onPress={() => setShowEndPicker(true)}
                        >
                          <Text style={{ fontSize: 14, color: propEnd ? Colors.textPrimary : Colors.textMuted }}>
                            {propEnd || t('home.pickEnd')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          disabled={actionPending || !propDate || !propStart || !propEnd}
                          style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.warning, opacity: (!propDate || !propStart || !propEnd) ? 0.5 : 1 }]}
                          onPress={() => {
                            setActionPending(true);
                            proposeNewTime(req.id, propDate, propStart, propEnd)
                              .then(() => { setProposeId(null); return load(); })
                              .catch(() => Alert.alert('', t('home.errPropose')))
                              .finally(() => setActionPending(false));
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('home.send')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.connectBtn, { flex: 1, height: 36, backgroundColor: Colors.border }]}
                          onPress={() => setProposeId(null)}
                        >
                          <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                      {showDatePicker && (
                        <DateTimePicker
                          value={propDateObj}
                          mode="date"
                          display="default"
                          onChange={(_, date) => {
                            setShowDatePicker(false);
                            if (date) { setPropDateObj(date); setPropDate(fmt(date)); }
                          }}
                        />
                      )}
                      {showStartPicker && (
                        <DateTimePicker
                          value={propStartObj}
                          mode="time"
                          display="default"
                          is24Hour
                          onChange={(_, date) => {
                            setShowStartPicker(false);
                            if (date) { setPropStartObj(date); setPropStart(date.toTimeString().slice(0, 5)); }
                          }}
                        />
                      )}
                      {showEndPicker && (
                        <DateTimePicker
                          value={propEndObj}
                          mode="time"
                          display="default"
                          is24Hour
                          onChange={(_, date) => {
                            setShowEndPicker(false);
                            if (date) { setPropEndObj(date); setPropEnd(date.toTimeString().slice(0, 5)); }
                          }}
                        />
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

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
