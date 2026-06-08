import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { MedicalRecord } from '@/lib/types';
import { createRecord } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

interface Props {
  visible: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onSaved: (record: MedicalRecord) => void;
}

function getCurrentDateTime() {
  const d = new Date();
  return {
    date: d.toISOString().split('T')[0],
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export function NewRecordModal({ visible, patientId, patientName, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { date, time } = useMemo(getCurrentDateTime, [visible]);

  function handleClose() {
    onClose();
    setContent('');
    setError('');
  }

  async function handleSave() {
    if (!content.trim()) { setError('Record content cannot be empty'); return; }
    setError('');
    setSaving(true);

    const recordData = {
      patientId,
      professionalId: user?.id ?? '',
      date,
      time,
      content: content.trim(),
    };

    try {
      if (user) {
        const saved = await createRecord(recordData);
        onSaved(saved);
      } else {
        onSaved({ ...recordData, id: Date.now().toString(), createdAt: new Date().toISOString() });
      }
      handleClose();
    } catch {
      setError('Failed to save record. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>New Record</Text>
              <Text style={styles.subtitle}>{patientName}</Text>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{date} at {time}</Text>
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TextInput
              style={styles.contentInput}
              placeholder="Write the medical record here..."
              placeholderTextColor={Colors.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { flex: 1, padding: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  metaText: { fontSize: 13, color: Colors.textMuted },
  errorText: { color: Colors.danger, fontSize: 13, marginBottom: 12 },
  contentInput: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 24,
    minHeight: 300,
    padding: 0,
  },
});
