import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
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

const DURATIONS = [30, 45, 60];
const INTERVALS = [15, 30];

export function SchedulingSettingsModal({ visible, settings, onClose, onSave }: Props) {
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [interval, setInterval] = useState(settings.scheduleSlotIntervalMinutes);
  const [apptType, setApptType] = useState(settings.defaultApptType);

  function handleSave() {
    onSave({
      defaultDurationMinutes: duration,
      scheduleSlotIntervalMinutes: interval,
      defaultApptType: apptType,
    });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.group.scheduling')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>{t('settings.scheduling.duration')}</Text>
          <View style={styles.pillRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.pill, duration === d && styles.pillActive]}
                onPress={() => setDuration(d)}
              >
                <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>
                  {d} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('settings.scheduling.interval')}</Text>
          <View style={styles.pillRow}>
            {INTERVALS.map(i => (
              <TouchableOpacity
                key={i}
                style={[styles.pill, interval === i && styles.pillActive]}
                onPress={() => setInterval(i)}
              >
                <Text style={[styles.pillText, interval === i && styles.pillTextActive]}>
                  {i} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('settings.scheduling.defaultType')}</Text>
          <View style={styles.pillRow}>
            {(['inPerson', 'online'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.pill, apptType === type && styles.pillActive]}
                onPress={() => setApptType(type)}
              >
                <Text style={[styles.pillText, apptType === type && styles.pillTextActive]}>
                  {type === 'inPerson' ? t('newAppt.inPerson') : t('newAppt.online')}
                </Text>
              </TouchableOpacity>
            ))}
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
    maxHeight: '70%',
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
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  pill: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pillText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.primary, fontWeight: '700' },
  saveBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
