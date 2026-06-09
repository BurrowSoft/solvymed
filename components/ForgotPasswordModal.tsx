import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useTranslation } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';
import { Colors } from '@/constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ForgotPasswordModal({ visible, onClose }: Props) {
  const { forgotPassword } = useAuth();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setEmail('');
    setError(null);
    setSent(false);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSend() {
    setError(null);
    if (!email.trim()) {
      setError(t('auth.validation.emailRequired'));
      return;
    }
    setLoading(true);
    const { error: err } = await forgotPassword(email.trim(), locale);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {sent ? (
            <View style={styles.sentBox}>
              <Ionicons name="mail-outline" size={32} color={Colors.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.sentTitle}>{t('auth.forgotPassword.sent')}</Text>
              <TouchableOpacity style={styles.backBtn} onPress={handleClose} testID="back-to-login">
                <Text style={styles.backBtnText}>{t('auth.forgotPassword.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>{t('auth.forgotPassword.subtitle')}</Text>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="email@example.com"
                placeholderTextColor={Colors.textSecondary}
                testID="forgot-email"
              />

              <TouchableOpacity
                style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={loading}
                testID="forgot-send"
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.sendBtnText}>{t('auth.forgotPassword.send')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} style={styles.cancelRow}>
                <Text style={styles.cancelText}>{t('auth.forgotPassword.backToLogin')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 48,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 20 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#dc2626', fontSize: 13 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary, marginBottom: 16,
  },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelRow: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  sentBox: { alignItems: 'center', paddingVertical: 24 },
  sentTitle: { fontSize: 15, color: Colors.textPrimary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  backBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
