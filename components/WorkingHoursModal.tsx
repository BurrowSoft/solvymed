import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, Switch,
  TouchableOpacity, ActivityIndicator, FlatList, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { WorkingDay, WorkingHours, WorkingHoursKey, Professional } from '@/lib/types';
import { updateWorkingHours } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

const DAY_ENTRIES: { key: WorkingHoursKey; i18nKey: string; short: string }[] = [
  { key: 'mon', i18nKey: 'wh.day.mon', short: 'Mo' },
  { key: 'tue', i18nKey: 'wh.day.tue', short: 'Tu' },
  { key: 'wed', i18nKey: 'wh.day.wed', short: 'We' },
  { key: 'thu', i18nKey: 'wh.day.thu', short: 'Th' },
  { key: 'fri', i18nKey: 'wh.day.fri', short: 'Fr' },
  { key: 'sat', i18nKey: 'wh.day.sat', short: 'Sa' },
  { key: 'sun', i18nKey: 'wh.day.sun', short: 'Su' },
];

const TIME_OPTS: string[] = [];
for (let h = 5; h <= 23; h++) {
  for (const m of [0, 30]) {
    TIME_OPTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const DEFAULT_SCHEDULE: Record<WorkingHoursKey, WorkingDay> = {
  mon: { enabled: true, start: '08:00', end: '18:00' },
  tue: { enabled: true, start: '08:00', end: '18:00' },
  wed: { enabled: true, start: '08:00', end: '18:00' },
  thu: { enabled: true, start: '08:00', end: '18:00' },
  fri: { enabled: true, start: '08:00', end: '18:00' },
  sat: { enabled: false, start: '08:00', end: '12:00' },
  sun: { enabled: false, start: '08:00', end: '12:00' },
};

interface Props {
  visible: boolean;
  professional: Professional | null;
  onClose: () => void;
  onSaved: () => void;
}

type PickerTarget = { day: WorkingHoursKey; field: 'start' | 'end' };

export function WorkingHoursModal({ visible, professional, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<Record<WorkingHoursKey, WorkingDay>>({ ...DEFAULT_SCHEDULE });
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  useEffect(() => {
    if (!visible) return;
    const wh = professional?.workingHours;
    if (wh && Object.keys(wh).length > 0) {
      const merged = { ...DEFAULT_SCHEDULE };
      for (const key of DAY_ENTRIES.map(d => d.key)) {
        if (wh[key]) merged[key] = wh[key]!;
      }
      setSchedule(merged);
    } else {
      setSchedule({ ...DEFAULT_SCHEDULE });
    }
  }, [visible, professional]);

  function toggleDay(key: WorkingHoursKey) {
    setSchedule(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  }

  function selectTime(time: string) {
    if (!picker) return;
    setSchedule(prev => ({ ...prev, [picker.day]: { ...prev[picker.day], [picker.field]: time } }));
    setPicker(null);
  }

  async function handleSave() {
    if (!user) { onClose(); return; }
    setSaving(true);
    try {
      await updateWorkingHours(user.id, schedule);
      onSaved();
      onClose();
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('wh.title')}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.hint}>
              {t('wh.hint')}
            </Text>
          </View>

          {DAY_ENTRIES.map((day) => {
            const dayData = schedule[day.key];
            return (
              <View key={day.key} style={styles.dayRow}>
                <Switch
                  value={dayData.enabled}
                  onValueChange={() => toggleDay(day.key)}
                  trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
                  thumbColor={dayData.enabled ? Colors.primary : Colors.textMuted}
                />
                <Text style={[styles.dayLabel, !dayData.enabled && styles.dayLabelOff]}>{t(day.i18nKey as any)}</Text>

                {dayData.enabled ? (
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      style={styles.timeBtn}
                      onPress={() => setPicker({ day: day.key, field: 'start' })}
                    >
                      <Text style={styles.timeBtnText}>{dayData.start}</Text>
                    </TouchableOpacity>
                    <Text style={styles.timeSep}>–</Text>
                    <TouchableOpacity
                      style={styles.timeBtn}
                      onPress={() => setPicker({ day: day.key, field: 'end' })}
                    >
                      <Text style={styles.timeBtnText}>{dayData.end}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.offLabel}>{t('wh.off')}</Text>
                )}
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Time picker sheet */}
        {picker && (
          <Modal visible animationType="slide" transparent onRequestClose={() => setPicker(null)}>
            <Pressable style={styles.pickerOverlay} onPress={() => setPicker(null)}>
              <Pressable style={styles.pickerSheet} onPress={() => {}}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>
                    {picker.field === 'start' ? t('wh.startTime') : t('wh.endTime')}
                  </Text>
                  <TouchableOpacity onPress={() => setPicker(null)}>
                    <Ionicons name="close" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={TIME_OPTS}
                  keyExtractor={t => t}
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                  initialScrollIndex={Math.max(0, TIME_OPTS.indexOf(schedule[picker.day][picker.field]))}
                  getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
                  renderItem={({ item }) => {
                    const selected = schedule[picker.day][picker.field] === item;
                    return (
                      <TouchableOpacity
                        style={[styles.timeOpt, selected && styles.timeOptSelected]}
                        onPress={() => selectTime(item)}
                      >
                        <Text style={[styles.timeOptText, selected && styles.timeOptTextSelected]}>
                          {item}
                        </Text>
                        {selected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1 },
  section: { backgroundColor: Colors.surface, marginTop: 12, padding: 16, borderBottomWidth: 1, borderTopWidth: 1, borderColor: Colors.border },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dayLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  dayLabelOff: { color: Colors.textMuted },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBtn: { backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  timeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  timeSep: { fontSize: 14, color: Colors.textMuted },
  offLabel: { fontSize: 13, color: Colors.textMuted },

  // Time picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  timeOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 48 },
  timeOptSelected: { backgroundColor: Colors.primaryLight },
  timeOptText: { fontSize: 16, color: Colors.textPrimary },
  timeOptTextSelected: { color: Colors.primary, fontWeight: '600' },
});
