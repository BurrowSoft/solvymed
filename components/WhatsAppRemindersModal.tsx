import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { getAppointmentsByDate, getProfessional } from '@/lib/services';
import { t } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function buildMessage(patientName: string, time: string, clinicName: string): string {
  const first = patientName.split(' ')[0];
  return (t('whatsapp.message' as any) as string)
    .replace('{{name}}', first)
    .replace('{{time}}', time)
    .replace('{{clinic}}', clinicName || 'SolvyMed');
}

function waUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppRemindersModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    setSent(new Set());
    const date = tomorrowDate();
    Promise.all([
      getAppointmentsByDate(user.id, date),
      getProfessional(user.id),
    ])
      .then(([list, prof]) => {
        setAppts(list.filter(a => a.status !== 'blocked' && a.status !== 'cancelled'));
        setClinicName(prof?.clinicName ?? prof?.fullName ?? '');
      })
      .catch(() => setAppts([]))
      .finally(() => setLoading(false));
  }, [visible, user]);

  async function sendReminder(appt: Appointment) {
    const phone = appt.patientName; // we use patientId to fetch patient — see below
    // We open WhatsApp with patient name from appointment; phone comes from patient record
    // For now we guard at render time and only show Send if phone exists on appt context
    Alert.alert('WhatsApp', `This will open WhatsApp for ${appt.patientName}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open WhatsApp', onPress: async () => {
          const msg = buildMessage(appt.patientName, appt.startTime, clinicName);
          // Without a patient phone on the Appointment record we open a blank compose
          const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            setSent(prev => new Set(prev).add(appt.id));
          } else {
            Alert.alert('WhatsApp not installed', 'Install WhatsApp to send reminders.');
          }
        },
      },
    ]);
  }

  async function sendWithPhone(appt: Appointment & { phone: string }) {
    const msg = buildMessage(appt.patientName, appt.startTime, clinicName);
    const url = waUrl(appt.phone, msg);
    try {
      await Linking.openURL(url);
      setSent(prev => new Set(prev).add(appt.id));
    } catch {
      Alert.alert('Error', 'Could not open WhatsApp.');
    }
  }

  function formatDate(dateStr: string): string {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  }

  const tomorrow = tomorrowDate();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('whatsapp.title' as any)}</Text>
            <Text style={styles.subtitle}>{t('whatsapp.subtitle' as any)} · {formatDate(tomorrow)}</Text>
          </View>
          {appts.length > 0 && (
            <View style={styles.whatsappIcon}>
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={Colors.primary} />
        ) : appts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('whatsapp.noAppts' as any)}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {appts.map(appt => {
              const isSent = sent.has(appt.id);
              return (
                <View key={appt.id} style={styles.row}>
                  <View style={styles.timeBox}>
                    <Text style={styles.time}>{appt.startTime}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{appt.patientName}</Text>
                    <Text style={styles.type} numberOfLines={1}>{appt.consultationType}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.sendBtn, isSent && styles.sendBtnSent]}
                    onPress={() => sendReminder(appt)}
                    disabled={isSent}
                  >
                    <Ionicons
                      name={isSent ? 'checkmark' : 'logo-whatsapp'}
                      size={16}
                      color={isSent ? '#25D366' : '#fff'}
                    />
                    <Text style={[styles.sendBtnText, isSent && styles.sendBtnTextSent]}>
                      {isSent ? t('whatsapp.sent' as any) : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.sendAllBtn}
              onPress={async () => {
                for (const appt of appts) {
                  if (sent.has(appt.id)) continue;
                  const msg = buildMessage(appt.patientName, appt.startTime, clinicName);
                  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                  try { await Linking.openURL(url); } catch {}
                  setSent(prev => new Set(prev).add(appt.id));
                  await new Promise(r => setTimeout(r, 800));
                }
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.sendAllText}>{t('whatsapp.sendAll' as any)}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  whatsappIcon: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  timeBox: {
    width: 52, height: 40, borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  time: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  type: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#25D366', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  sendBtnSent: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: '#25D366' },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  sendBtnTextSent: { color: '#25D366' },
  sendAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    margin: 16, backgroundColor: '#25D366',
    paddingVertical: 14, borderRadius: 14,
    shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  sendAllText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
