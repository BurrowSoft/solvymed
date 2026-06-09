import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/auth-context';
import { getProfessional, getPatients } from '@/lib/services';
import { Professional } from '@/lib/types';
import { ProfileModal } from '@/components/ProfileModal';
import { WorkingHoursModal } from '@/components/WorkingHoursModal';
import { DocumentTemplatesModal } from '@/components/DocumentTemplatesModal';
import { ProceduresModal } from '@/components/ProceduresModal';
import { MyClinicModal } from '@/components/MyClinicModal';
import { LanguagePickerModal } from '@/components/LanguagePickerModal';
import { SchedulingSettingsModal } from '@/components/SchedulingSettingsModal';
import { NotificationSettingsModal } from '@/components/NotificationSettingsModal';
import { ThemePickerModal } from '@/components/ThemePickerModal';
import { SecuritySettingsModal } from '@/components/SecuritySettingsModal';
import { FinancialSettingsModal } from '@/components/FinancialSettingsModal';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { t } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';
import { useTheme } from '@/lib/theme-context';
import { useAppSettings, AppSettings } from '@/lib/app-settings';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingItem {
  label: string;
  icon: IoniconName;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
}
interface SettingGroup { title: string; items: SettingItem[]; }

const LANGUAGE_NAMES: Record<string, string> = {
  'pt-BR': 'Português',
  'en': 'English',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'it-IT': 'Italiano',
  'es-ES': 'Español',
};

const THEME_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  warm: 'Warm',
  ocean: 'Ocean',
};

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { locale } = useLocale();
  const { theme, setTheme } = useTheme();
  const { settings, update: updateSettings } = useAppSettings();
  const [professional, setProfessional] = useState<Professional | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showDocumentTemplates, setShowDocumentTemplates] = useState(false);
  const [showProcedures, setShowProcedures] = useState(false);
  const [showMyClinic, setShowMyClinic] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showScheduling, setShowScheduling] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showFinancial, setShowFinancial] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProfessional(user.id).then(setProfessional).catch(() => {});
  }, [user]);

  async function handleExportCSV() {
    if (!user) return;
    try {
      Alert.alert('', t('settings.data.exporting'));
      const patients = await getPatients(user.id);

      const headers = ['Name', 'CPF', 'Sex', 'Birth Date', 'Phone', 'Email', 'Profession', 'Tags'];
      const rows = patients.map(p => [
        p.fullName,
        p.cpf ?? '',
        p.sex ?? '',
        p.birthDate ?? '',
        p.phone ?? '',
        p.email ?? '',
        p.profession ?? '',
        (p.tags ?? []).join('; '),
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const path = `${FileSystem.cacheDirectory}patients_export.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Patients' });
      } else {
        Alert.alert('', t('settings.data.exportDone'));
      }
    } catch {
      Alert.alert('', t('settings.data.exportFailed'));
    }
  }

  function durationDetail(s: AppSettings) {
    return `${s.defaultDurationMinutes} min`;
  }

  function leadDetail(s: AppSettings) {
    const m = s.reminderLeadMinutes;
    if (m < 60) return `${m} min`;
    return `${m / 60}h`;
  }

  function autoLockDetail(s: AppSettings) {
    if (s.autoLockMinutes === 0) return t('settings.security.autoLock.never');
    return `${s.autoLockMinutes} min`;
  }

  const appVersion = Constants.expoConfig?.version ?? '—';

  const SETTINGS: SettingGroup[] = [
    {
      title: t('settings.group.profile'),
      items: [
        { label: t('settings.myProfile'), icon: 'person-outline', onPress: () => setShowProfile(true) },
        { label: t('settings.myClinic'), icon: 'business-outline', onPress: () => setShowMyClinic(true) },
        { label: t('settings.workingHours'), icon: 'calendar-outline', onPress: () => setShowWorkingHours(true) },
      ],
    },
    {
      title: t('settings.group.procedures'),
      items: [
        { label: t('settings.procedures'), icon: 'list-outline', onPress: () => setShowProcedures(true) },
        { label: t('settings.documentTemplates'), icon: 'document-text-outline', onPress: () => setShowDocumentTemplates(true) },
      ],
    },
    {
      title: t('settings.group.scheduling'),
      items: [
        {
          label: t('settings.scheduling.duration'),
          icon: 'time-outline',
          detail: durationDetail(settings),
          onPress: () => setShowScheduling(true),
        },
        {
          label: t('settings.scheduling.defaultType'),
          icon: settings.defaultApptType === 'online' ? 'videocam-outline' : 'location-outline',
          detail: settings.defaultApptType === 'online' ? t('newAppt.online') : t('newAppt.inPerson'),
          onPress: () => setShowScheduling(true),
        },
      ],
    },
    {
      title: t('settings.group.notifications'),
      items: [
        {
          label: t('settings.notifications.reminders'),
          icon: 'notifications-outline',
          detail: settings.remindersEnabled ? leadDetail(settings) : 'Off',
          onPress: () => setShowNotifications(true),
        },
        {
          label: t('settings.notifications.dailySummary'),
          icon: 'sunny-outline',
          detail: settings.dailySummaryEnabled ? 'On' : 'Off',
          onPress: () => setShowNotifications(true),
        },
      ],
    },
    {
      title: t('settings.group.appearance'),
      items: [
        {
          label: t('settings.appearance.theme'),
          icon: 'color-palette-outline',
          detail: THEME_NAMES[theme] ?? theme,
          onPress: () => setShowThemePicker(true),
        },
        {
          label: t('settings.language'),
          icon: 'language-outline',
          detail: LANGUAGE_NAMES[locale] ?? locale,
          onPress: () => setShowLanguagePicker(true),
        },
      ],
    },
    {
      title: t('settings.group.security'),
      items: [
        {
          label: t('settings.security.biometric'),
          icon: 'finger-print-outline',
          detail: settings.biometricLockEnabled ? 'On' : 'Off',
          onPress: () => setShowSecurity(true),
        },
        {
          label: t('settings.security.autoLock'),
          icon: 'lock-closed-outline',
          detail: autoLockDetail(settings),
          onPress: () => setShowSecurity(true),
        },
        {
          label: t('settings.security.changePassword'),
          icon: 'key-outline',
          onPress: () => setShowChangePassword(true),
        },
      ],
    },
    {
      title: t('settings.group.financial'),
      items: [
        {
          label: t('settings.financial.paymentType'),
          icon: 'card-outline',
          detail: settings.defaultPaymentType === 'private'
            ? t('settings.financial.private')
            : t('settings.financial.insurance'),
          onPress: () => setShowFinancial(true),
        },
        {
          label: t('settings.financial.invoiceFooter'),
          icon: 'receipt-outline',
          onPress: () => setShowFinancial(true),
        },
      ],
    },
    {
      title: t('settings.group.data'),
      items: [
        {
          label: t('settings.data.exportCSV'),
          icon: 'download-outline',
          onPress: handleExportCSV,
        },
        {
          label: t('settings.data.version'),
          icon: 'information-circle-outline',
          detail: appVersion,
        },
      ],
    },
    {
      title: t('settings.group.configuration'),
      items: [
        { label: t('settings.registrations'), icon: 'list-outline' },
        { label: t('settings.integrations'), icon: 'link-outline' },
        { label: t('settings.modules'), icon: 'grid-outline' },
        { label: t('settings.help'), icon: 'help-circle-outline' },
      ],
    },
  ];

  const displayName = professional?.fullName || t('settings.profilePlaceholder');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.profileCard} onPress={() => setShowProfile(true)}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitial}>
              {displayName[0]?.toUpperCase() ?? 'D'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>
              {professional?.specialty ? professional.specialty : user?.email ?? t('settings.profileSubPlaceholder')}
            </Text>
            {professional?.clinicName ? (
              <Text style={styles.profileClinic}>{professional.clinicName}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {SETTINGS.map(group => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.settingRow, i < group.items.length - 1 && styles.settingRowBorder]}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                >
                  <View style={styles.settingIcon}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={[styles.settingLabel, item.destructive && { color: Colors.danger }]}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text style={styles.settingDetail}>{item.detail}</Text>
                  ) : null}
                  {item.onPress ? (
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <ProfileModal
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        onSaved={(prof) => setProfessional(prof)}
      />
      <WorkingHoursModal
        visible={showWorkingHours}
        professional={professional}
        onClose={() => setShowWorkingHours(false)}
        onSaved={() => {
          if (user) getProfessional(user.id).then(setProfessional).catch(() => {});
        }}
      />
      <DocumentTemplatesModal
        visible={showDocumentTemplates}
        professional={professional}
        onClose={() => setShowDocumentTemplates(false)}
      />
      {user && (
        <ProceduresModal
          visible={showProcedures}
          professionalId={user.id}
          onClose={() => setShowProcedures(false)}
        />
      )}
      <MyClinicModal
        visible={showMyClinic}
        professional={professional}
        onClose={() => setShowMyClinic(false)}
        onSaved={(updated) => setProfessional(updated)}
      />
      <LanguagePickerModal
        visible={showLanguagePicker}
        onClose={() => setShowLanguagePicker(false)}
      />
      <SchedulingSettingsModal
        visible={showScheduling}
        settings={settings}
        onClose={() => setShowScheduling(false)}
        onSave={(patch) => updateSettings(patch)}
      />
      <NotificationSettingsModal
        visible={showNotifications}
        settings={settings}
        onClose={() => setShowNotifications(false)}
        onSave={(patch) => updateSettings(patch)}
      />
      <ThemePickerModal
        visible={showThemePicker}
        currentTheme={theme}
        onClose={() => setShowThemePicker(false)}
        onSelect={(key) => setTheme(key)}
      />
      <SecuritySettingsModal
        visible={showSecurity}
        settings={settings}
        onClose={() => setShowSecurity(false)}
        onSave={(patch) => updateSettings(patch)}
      />
      <FinancialSettingsModal
        visible={showFinancial}
        settings={settings}
        onClose={() => setShowFinancial(false)}
        onSave={(patch) => updateSettings(patch)}
      />
      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, margin: 16, padding: 16,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  profileAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  profileInitial: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  profileName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  profileEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  profileClinic: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  group: { marginHorizontal: 16, marginBottom: 16 },
  groupTitle: {
    fontSize: 11, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginLeft: 4,
  },
  groupCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  settingDetail: { fontSize: 13, color: Colors.textSecondary, marginRight: 4 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 14, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  signOutText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
});
