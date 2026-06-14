import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

interface Entry { type: 'feature' | 'fix' | 'improvement'; text: string; }
interface ChangelogVersion { version: string; date: string; entries: Entry[]; }

interface Props { visible: boolean; onClose: () => void; }

const ENTRY_META: Record<Entry['type'], { icon: string; color: () => string; label: string }> = {
  feature: { icon: 'sparkles-outline', color: () => Colors.primary, label: 'New' },
  fix: { icon: 'bug-outline', color: () => Colors.success, label: 'Fix' },
  improvement: { icon: 'arrow-up-circle-outline', color: () => Colors.warning, label: 'Improved' },
};

// Hardcoded fallback — update by uploading changelog.json to Supabase Storage (app-meta bucket)
const FALLBACK: ChangelogVersion[] = [
  {
    version: '2.3.0',
    date: '2026-06-11',
    entries: [
      { type: 'feature', text: 'Theme changes now apply instantly — no restart required' },
      { type: 'fix', text: 'Patient name changes are now reflected in all scheduled appointments' },
      { type: 'feature', text: 'Monthly payment report is expandable — tap any month to see all appointments' },
      { type: 'feature', text: 'Revert a payment status from paid back to pending' },
      { type: 'improvement', text: 'Time formatting updated to H:MM across the app' },
      { type: 'improvement', text: 'Consultation types are now translated to your language' },
      { type: 'improvement', text: 'Home and payments screens refresh automatically on tab focus' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-05-20',
    entries: [
      { type: 'feature', text: 'Dashboard refresh timer with 60-second countdown' },
      { type: 'feature', text: 'Blocked slot alert shows the blocked time range (from/to)' },
      { type: 'feature', text: 'Appointment overlap alert shows patient name, time, and duration' },
      { type: 'feature', text: 'Doctor avatar displayed next to greeting on wider screens' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-04-15',
    entries: [
      { type: 'feature', text: 'Multi-theme support: Light, Dark, Warm, Ocean' },
      { type: 'feature', text: 'Biometric / PIN auto-lock for app security' },
      { type: 'feature', text: 'Financial settings: default payment type and invoice footer' },
      { type: 'feature', text: 'Scheduling settings: default duration and appointment type' },
      { type: 'feature', text: 'Notification settings: reminders and daily summaries' },
    ],
  },
];

async function fetchChangelog(): Promise<ChangelogVersion[]> {
  try {
    const { data, error } = await supabase.storage.from('app-meta').download('changelog.json');
    if (error || !data) return FALLBACK;
    const text = await (data as Blob).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function ChangelogModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const [items, setItems] = useState<ChangelogVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchChangelog().then(data => {
      setItems(data);
      setLoading(false);
    });
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.data.changelog')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {items.map((v, vi) => (
              <View key={vi} style={styles.versionCard}>
                <View style={styles.versionHeader}>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionNum}>v{v.version}</Text>
                  </View>
                  <Text style={styles.versionDate}>{v.date}</Text>
                </View>
                <View style={styles.entriesList}>
                  {v.entries.map((e, ei) => {
                    const meta = ENTRY_META[e.type];
                    return (
                      <View key={ei} style={styles.entry}>
                        <View style={[styles.entryTag, { backgroundColor: meta.color() + '18' }]}>
                          <Ionicons name={meta.icon as any} size={12} color={meta.color()} />
                          <Text style={[styles.entryTagText, { color: meta.color() }]}>{meta.label}</Text>
                        </View>
                        <Text style={styles.entryText}>{e.text}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            <Text style={styles.footer}>
              To update the changelog, upload changelog.json to the Supabase{'\n'}Storage bucket "app-meta".
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  loader: { height: 120, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },

  versionCard: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10,
  },
  versionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  versionBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  versionNum: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  versionDate: { fontSize: 12, color: Colors.textMuted },

  entriesList: { gap: 8 },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  entryTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, flexShrink: 0,
  },
  entryTagText: { fontSize: 10, fontWeight: '700' },
  entryText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  footer: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 17 },
});
