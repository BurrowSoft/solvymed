import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';

interface Props { visible: boolean; onClose: () => void; }

interface Module {
  icon: string;
  name: string;
  description: string;
  active: boolean;
}

const ACTIVE_MODULES: Module[] = [
  { icon: 'calendar', name: 'Scheduling & Calendar', description: 'Day/week view, time blocks, recurring appointments', active: true },
  { icon: 'people', name: 'Patient Management', description: 'Full patient history, records, prescriptions, files', active: true },
  { icon: 'card', name: 'Financial Control', description: 'Payments, monthly reports, revenue tracking', active: true },
  { icon: 'document-text', name: 'Document Templates', description: 'Custom prescription and medical record templates', active: true },
  { icon: 'logo-whatsapp', name: 'WhatsApp Reminders', description: 'Automated appointment reminders via WhatsApp', active: true },
  { icon: 'color-palette', name: 'Theme Customization', description: 'Light, Dark, Warm and Ocean themes', active: true },
  { icon: 'language', name: 'Multi-language', description: 'Portuguese, English, French, Spanish, German, Italian', active: true },
  { icon: 'lock-closed', name: 'Security & Biometric Lock', description: 'PIN and fingerprint auto-lock', active: true },
];

const COMING_MODULES: Module[] = [
  { icon: 'videocam-outline', name: 'Telemedicine', description: 'Video consultations directly in the app', active: false },
  { icon: 'globe-outline', name: 'Online Booking Portal', description: 'Let patients book appointments online', active: false },
  { icon: 'bar-chart-outline', name: 'Analytics & Reports', description: 'Advanced insights, trends, and exportable reports', active: false },
  { icon: 'people-outline', name: 'Multi-professional', description: 'Manage multiple doctors in the same clinic', active: false },
  { icon: 'server-outline', name: 'API & Webhooks', description: 'Connect SolvyMed to external tools and systems', active: false },
  { icon: 'phone-portrait-outline', name: 'Patient App', description: 'A companion app for your patients', active: false },
];

export function ModulesModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.modules')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>Active</Text>
          {ACTIVE_MODULES.map((m, i) => (
            <ModuleCard key={i} module={m} />
          ))}

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Coming Soon</Text>
          {COMING_MODULES.map((m, i) => (
            <ModuleCard key={i} module={m} />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModuleCard({ module: m }: { module: Module }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.card, !m.active && styles.cardMuted]}>
      <View style={[styles.iconWrap, { backgroundColor: m.active ? Colors.primaryLight : Colors.border + '40' }]}>
        <Ionicons name={m.icon as any} size={22} color={m.active ? Colors.primary : Colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.cardName, !m.active && styles.cardNameMuted]}>{m.name}</Text>
          {m.active && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
          {!m.active && (
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Soon</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardDesc}>{m.description}</Text>
      </View>
    </View>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  cardMuted: { opacity: 0.65 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardNameMuted: { color: Colors.textSecondary },
  cardDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },

  activeBadge: { backgroundColor: Colors.success + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  soonBadge: { backgroundColor: Colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soonBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
});
