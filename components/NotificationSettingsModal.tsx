import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Switch, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { AppSettings } from '@/lib/app-settings';

interface Props {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => void;
}

const LEAD_OPTIONS: Array<{ minutes: number; labelKey: Parameters<typeof t>[0] }> = [
  { minutes: 15, labelKey: 'settings.notifications.lead.15min' },
  { minutes: 60, labelKey: 'settings.notifications.lead.1h' },
  { minutes: 120, labelKey: 'settings.notifications.lead.2h' },
  { minutes: 1440, labelKey: 'settings.notifications.lead.24h' },
];

export function NotificationSettingsModal({ visible, settings, onClose, onSave }: Props) {
  const [reminders, setReminders] = useState(settings.remindersEnabled);
  const [lead, setLead] = useState(settings.reminderLeadMinutes);
  const [daily, setDaily] = useState(settings.dailySummaryEnabled);

  function handleSave() {
    onSave({
      remindersEnabled: reminders,
      reminderLeadMinutes: lead,
      dailySummaryEnabled: daily,
    });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.group.notifications')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('settings.notifications.reminders')}</Text>
            </View>
            <Switch
              value={reminders}
              onValueChange={setReminders}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {reminders && (
            <>
              <Text style={styles.sectionLabel}>{t('settings.notifications.leadTime')}</Text>
              {LEAD_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.minutes}
                  style={styles.optionRow}
                  onPress={() => setLead(opt.minutes)}
                >
                  <Text style={[styles.optionText, lead === opt.minutes && styles.optionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                  {lead === opt.minutes && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={[styles.toggleRow, { marginTop: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('settings.notifications.dailySummary')}</Text>
              <Text style={styles.toggleSubtitle}>Push notification each morning</Text>
            </View>
            <Switch
              value={daily}
              onValueChange={setDaily}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  toggleSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  optionText: { fontSize: 14, color: Colors.textSecondary },
  optionTextActive: { color: Colors.primary, fontWeight: '600' },
  saveBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
