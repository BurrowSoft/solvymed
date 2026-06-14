import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable,
  ScrollView, TextInput, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  prefillName?: string;
  prefillEmail?: string;
}

type Category = 'technical' | 'billing' | 'feature' | 'other';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'technical', label: 'Technical Issue', icon: 'bug-outline' },
  { key: 'billing', label: 'Billing', icon: 'card-outline' },
  { key: 'feature', label: 'Feature Request', icon: 'bulb-outline' },
  { key: 'other', label: 'Other', icon: 'chatbubble-outline' },
];

export function ContactModal({ visible, onClose, prefillName = '', prefillEmail = '' }: Props) {
  const styles = useStyles(makeStyles);
  const [category, setCategory] = useState<Category>('technical');
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!message.trim()) return;
    const cat = CATEGORIES.find(c => c.key === category)?.label ?? 'General';
    const subject = encodeURIComponent(`SolvyMed — ${cat}`);
    const body = encodeURIComponent(
      `Name: ${name || 'Not provided'}\nEmail: ${email || 'Not provided'}\n\nMessage:\n${message}`,
    );
    Linking.openURL(`mailto:support@solvymed.com?subject=${subject}&body=${body}`)
      .then(() => {
        setSent(true);
        setTimeout(() => {
          setSent(false);
          setMessage('');
          onClose();
        }, 1500);
      })
      .catch(() => {});
  }

  function handleClose() {
    setMessage('');
    setSent(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('contact.title')}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {sent ? (
              <View style={styles.sentBox}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                <Text style={styles.sentTitle}>{t('contact.sent')}</Text>
                <Text style={styles.sentSub}>{t('contact.sentSub')}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>{t('contact.subject')}</Text>
                <View style={styles.categoryRow}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
                      onPress={() => setCategory(c.key)}
                    >
                      <Ionicons
                        name={c.icon as any}
                        size={14}
                        color={category === c.key ? '#fff' : Colors.textSecondary}
                      />
                      <Text style={[styles.categoryText, category === c.key && styles.categoryTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>{t('contact.name')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('contact.namePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={styles.sectionLabel}>{t('contact.email')}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('contact.emailPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.sectionLabel}>{t('contact.message')}</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('contact.messagePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                <Text style={styles.hint}>{t('contact.hint')}</Text>

                <TouchableOpacity
                  style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!message.trim()}
                >
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>{t('contact.send')}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  categoryTextActive: { color: '#fff' },

  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: Colors.textPrimary,
  },
  textarea: { height: 120, paddingTop: 11 },

  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  sentBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  sentTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  sentSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
