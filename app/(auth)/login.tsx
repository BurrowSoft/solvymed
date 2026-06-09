import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';

export default function LoginScreen() {
  const { signIn, resendConfirmation } = useAuth();
  const router = useRouter();
  // Subscribe to locale changes so t() results update when the user changes language
  useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      setError(t('auth.signIn.fillFields'));
      return;
    }
    setLoading(true);
    setError(null);
    setUnconfirmedEmail(null);
    setResendSent(false);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      if (error.toLowerCase().includes('not confirmed')) {
        setUnconfirmedEmail(email.trim());
      } else {
        setError(error);
      }
    }
  }

  async function handleResend() {
    if (!unconfirmedEmail) return;
    setResendLoading(true);
    const { error } = await resendConfirmation(unconfirmedEmail);
    setResendLoading(false);
    if (error) {
      setError(error);
    } else {
      setResendSent(true);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>S</Text>
          </View>
          <Text style={styles.appName}>SolvyMed</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>{t('auth.signIn.title')}</Text>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {unconfirmedEmail && !resendSent && (
            <View style={styles.warningBox}>
              <View style={styles.warningContent}>
                <Ionicons name="mail-outline" size={16} color="#92400E" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>{t('auth.signIn.unconfirmedTitle')}</Text>
                  <Text style={styles.warningText}>
                    {t('auth.signIn.unconfirmedBody', { email: unconfirmedEmail })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleResend}
                disabled={resendLoading}
                testID="resend-btn"
              >
                {resendLoading
                  ? <ActivityIndicator size="small" color="#92400E" />
                  : <Text style={styles.resendBtnText}>{t('auth.signIn.resend')}</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {resendSent && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#065F46" />
              <Text style={styles.successText}>{t('auth.signIn.resendSuccess')}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.signIn.emailLabel')}</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.signIn.passwordLabel')}</Text>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            testID="signin-submit"
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginBtnText}>{t('auth.signIn.submit')}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotBtn} onPress={() => setShowForgotPassword(true)}>
            <Text style={styles.forgotText}>{t('auth.signIn.forgotPassword')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.signUpRow}>
          <Text style={styles.signUpHint}>{t('auth.signIn.noAccount')} </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.signUpLink}>{t('auth.signIn.signUpLink')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>SolvyMed by BurrowSoft</Text>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
        visible={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 32 },
  logoArea: { alignItems: 'center', gap: 8 },
  logoMark: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  logoLetter: { fontSize: 36, fontWeight: '800', color: '#fff' },
  appName: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  tagline: { fontSize: 14, color: Colors.textSecondary },
  form: { gap: 16 },
  formTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { fontSize: 13, color: Colors.danger, flex: 1 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, height: 50,
  },
  input: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  loginBtn: {
    backgroundColor: Colors.primary, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotBtn: { alignItems: 'center' },
  forgotText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  signUpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signUpHint: { fontSize: 14, color: Colors.textSecondary },
  signUpLink: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: 12, color: Colors.textMuted },
  warningBox: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 8, padding: 12, gap: 10,
  },
  warningContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningTitle: { fontSize: 13, fontWeight: '600', color: '#92400E', marginBottom: 2 },
  warningText: { fontSize: 12, color: '#92400E', lineHeight: 18 },
  resendBtn: {
    alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 6, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
  },
  resendBtnText: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  successText: { fontSize: 13, color: '#065F46', flex: 1 },
});
