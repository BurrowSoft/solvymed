import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useTranslation } from '@/lib/i18n';
import { Colors } from '@/constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ visible, onClose }: Props) {
  const { changePassword } = useAuth();
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setShowCurrent(false);
    setShowNext(false);
    setShowConfirm(false);
    setError(null);
    setSuccess(false);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    if (!current || !next || !confirm) {
      setError(t('auth.validation.allFields'));
      return;
    }
    if (next !== confirm) {
      setError(t('auth.validation.passwordMatch'));
      return;
    }
    if (next.length < 6) {
      setError(t('auth.validation.passwordLength'));
      return;
    }
    if (next === current) {
      setError(t('auth.changePassword.sameError'));
      return;
    }
    setLoading(true);
    const { error: err } = await changePassword(current, next);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess(true);
    setTimeout(() => { handleClose(); }, 1800);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('auth.changePassword.title')}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
              <Text style={styles.successText}>{t('auth.changePassword.success')}</Text>
            </View>
          ) : (
            <>
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Text style={styles.label}>{t('auth.changePassword.current')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry={!showCurrent}
                  autoCapitalize="none"
                  testID="current-password"
                />
                <TouchableOpacity onPress={() => setShowCurrent(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('auth.changePassword.new')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={next}
                  onChangeText={setNext}
                  secureTextEntry={!showNext}
                  autoCapitalize="none"
                  testID="new-password"
                />
                <TouchableOpacity onPress={() => setShowNext(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showNext ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('auth.changePassword.confirm')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  testID="confirm-password"
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                testID="change-password-submit"
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>{t('auth.changePassword.title')}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40, maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 20 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 16 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.textPrimary },
  eyeBtn: { paddingHorizontal: 12 },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginTop: 8 },
  errorText: { color: '#dc2626', fontSize: 13 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, marginTop: 8 },
  successText: { color: '#16a34a', fontSize: 14, fontWeight: '600', flex: 1 },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
