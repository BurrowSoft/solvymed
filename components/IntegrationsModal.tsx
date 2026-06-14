import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { getAppointmentsByWeek } from '@/lib/services';

interface Props { visible: boolean; onClose: () => void; }

function padZ(n: number) { return n.toString().padStart(2, '0'); }

function toICSDate(date: string, time: string): string {
  // date: YYYY-MM-DD, time: HH:MM or HH:MM:SS
  const [y, mo, d] = date.split('-');
  const [h, m] = time.split(':');
  return `${y}${padZ(Number(mo))}${padZ(Number(d))}T${padZ(Number(h))}${padZ(Number(m))}00`;
}

function addMinutes(date: string, time: string, minutes: number): string {
  const base = new Date(`${date}T${time}`);
  base.setMinutes(base.getMinutes() + minutes);
  const y = base.getFullYear();
  const mo = padZ(base.getMonth() + 1);
  const d = padZ(base.getDate());
  const h = padZ(base.getHours());
  const mi = padZ(base.getMinutes());
  return `${y}${mo}${d}T${h}${mi}00`;
}

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: fmt(monday), to: fmt(sunday) };
}

export function IntegrationsModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const { user } = useAuth();
  const [exportingICS, setExportingICS] = useState(false);

  async function handleExportICS() {
    if (!user) return;
    setExportingICS(true);
    try {
      const { from, to } = getWeekRange();
      const appts = await getAppointmentsByWeek(user.id, from, to);
      const relevant = appts.filter(a => a.status !== 'blocked' && a.status !== 'cancelled');

      const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const events = relevant.map(a => {
        const uid = `${a.id}@solvymed`;
        const dtStart = toICSDate(a.date, a.startTime);
        const dtEnd = addMinutes(a.date, a.startTime, a.durationMinutes);
        const summary = a.patientName;
        const description = `Type: ${a.consultationType}\\nStatus: ${a.status}`;
        const location = a.type === 'online' ? 'Online' : 'In-person';
        return [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${now}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          `LOCATION:${location}`,
          'END:VEVENT',
        ].join('\r\n');
      });

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SolvyMed//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...events,
        'END:VCALENDAR',
      ].join('\r\n');

      const path = `${FileSystem.cacheDirectory}solvymed_week.ics`;
      await FileSystem.writeAsStringAsync(path, ics, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/calendar',
          dialogTitle: 'Export appointments to calendar',
        });
      } else {
        Alert.alert('', 'ICS file saved.');
      }
    } catch (e) {
      Alert.alert('', 'Export failed. Please try again.');
    } finally {
      setExportingICS(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.integrations')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Data Export */}
          <Text style={styles.sectionTitle}>Data Export</Text>
          <View style={styles.card}>
            <ActionRow
              icon="calendar-outline"
              title="Export to Calendar (ICS)"
              subtitle="Export this week's appointments as a .ics file — open in Google Calendar, Apple Calendar, or Outlook"
              badge="Available"
              badgeColor={Colors.success}
              onPress={handleExportICS}
              loading={exportingICS}
            />
            <ActionRow
              icon="people-outline"
              title="Patient List (CSV)"
              subtitle="Export all patient data as a spreadsheet — available in Settings › Data & Info"
              badge="Available"
              badgeColor={Colors.success}
              border
            />
          </View>

          {/* Medical Standards */}
          <Text style={styles.sectionTitle}>Medical Standards</Text>
          <View style={styles.card}>
            <ActionRow
              icon="medkit-outline"
              title="TISS XML (ANS)"
              subtitle="Brazilian health insurance billing format (TISS 3.x). Required for reimbursement claims with insurance operators."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border={false}
            />
            <ActionRow
              icon="share-social-outline"
              title="HL7 FHIR R4"
              subtitle="International interoperability standard for sharing patient data with other health systems."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border
            />
            <ActionRow
              icon="barcode-outline"
              title="SCTID / SNOMED-CT"
              subtitle="Standard clinical terminology codes for diagnoses and procedures."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border
            />
          </View>

          {/* Connections */}
          <Text style={styles.sectionTitle}>Connections</Text>
          <View style={styles.card}>
            <ActionRow
              icon="logo-google"
              title="Google Calendar Sync"
              subtitle="Two-way sync — appointments appear in Google Calendar and vice versa."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border={false}
            />
            <ActionRow
              icon="server-outline"
              title="Webhook"
              subtitle="Send real-time appointment events to your own server or tools like Zapier."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border
            />
            <ActionRow
              icon="code-slash-outline"
              title="REST API"
              subtitle="Programmatic access to your SolvyMed data for custom integrations."
              badge="Coming soon"
              badgeColor={Colors.textMuted}
              border
            />
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={styles.infoText}>
              Need a specific integration? Contact us at{' '}
              <Text style={{ color: Colors.primary }}>support@solvymed.com</Text>
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon, title, subtitle, badge, badgeColor, onPress, loading, border,
}: {
  icon: string; title: string; subtitle: string;
  badge: string; badgeColor: string;
  onPress?: () => void; loading?: boolean; border?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[styles.actionRow, border && styles.actionBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { backgroundColor: badgeColor === Colors.success ? Colors.primaryLight : Colors.border + '30' }]}>
        <Ionicons name={icon as any} size={20} color={badgeColor === Colors.success ? Colors.primary : Colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.actionTitle}>{title}</Text>
          <View style={[styles.actionBadge, { backgroundColor: badgeColor + '20' }]}>
            <Text style={[styles.actionBadgeText, { color: badgeColor }]}>{badge}</Text>
          </View>
        </View>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      ) : null}
    </Wrap>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  card: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
  actionBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  actionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  actionSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  actionBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  actionBadgeText: { fontSize: 10, fontWeight: '700' },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});
