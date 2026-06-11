import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable,
  TextInput, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t, tn } from '@/lib/i18n';
import { getPatientPushTokens, sendPushNotifications } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function MassMessageModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!title.trim()) {
      Alert.alert('', t('mass.titleRequired'));
      return;
    }
    if (!user) return;
    setSending(true);
    try {
      const recipients = await getPatientPushTokens(user.id);
      if (!recipients.length) {
        Alert.alert('', t('mass.noTokens'));
        return;
      }
      const tokens = recipients.map(r => r.token);
      const sent = await sendPushNotifications(tokens, title.trim(), body.trim());
      const key = sent === 1 ? 'mass.sent' : 'mass.sent_plural';
      Alert.alert('', tn(key as any, sent), [
        { text: 'OK', onPress: () => { setTitle(''); setBody(''); onClose(); } },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to send notifications. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('mass.title')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Ionicons name="megaphone-outline" size={16} color={Colors.primary} />
            <Text style={styles.infoText}>{t('mass.selectAll')}</Text>
          </View>

          <Text style={styles.fieldLabel}>{t('mass.notifTitle')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('mass.notifTitlePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.fieldLabel}>{t('mass.notifBody')}</Text>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder={t('mass.notifBodyPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.sendBtn, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>{t('mass.send')}</Text>
                </>
            }
          </TouchableOpacity>
        </View>
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
  body: { paddingHorizontal: 20, paddingTop: 16 },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: 10, padding: 12, marginBottom: 20,
    borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  infoText: { fontSize: 13, color: Colors.primary, fontWeight: '500', flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary, marginBottom: 16,
  },
  bodyInput: { height: 110, paddingTop: 12 },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, height: 52, borderRadius: 14,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  sendBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
