import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/auth-context';
import { getProfessional } from '@/lib/services';
import { Professional } from '@/lib/types';
import { ProfileModal } from '@/components/ProfileModal';
import { WorkingHoursModal } from '@/components/WorkingHoursModal';
import { DocumentTemplatesModal } from '@/components/DocumentTemplatesModal';
import { ProceduresModal } from '@/components/ProceduresModal';
import { MyClinicModal } from '@/components/MyClinicModal';
import { LanguagePickerModal } from '@/components/LanguagePickerModal';
import { t } from '@/lib/i18n';
import { useLocale } from '@/lib/locale-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingItem { label: string; icon: IoniconName; detail?: string; onPress?: () => void; }
interface SettingGroup { title: string; items: SettingItem[]; }

const LANGUAGE_NAMES: Record<string, string> = {
  'pt-BR': 'Português',
  'en': 'English',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'it-IT': 'Italiano',
  'es-ES': 'Español',
};

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { locale } = useLocale();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showDocumentTemplates, setShowDocumentTemplates] = useState(false);
  const [showProcedures, setShowProcedures] = useState(false);
  const [showMyClinic, setShowMyClinic] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProfessional(user.id).then(setProfessional).catch(() => {});
  }, [user]);

  function comingSoon(label: string) {
    return () => Alert.alert(label, t('settings.comingSoon'), [{ text: 'OK' }]);
  }

  const SETTINGS: SettingGroup[] = [
    {
      title: t('settings.group.profile'),
      items: [
        { label: t('settings.myProfile'), icon: 'person-outline', onPress: () => setShowProfile(true) },
        { label: t('settings.myClinic'), icon: 'business-outline', onPress: () => setShowMyClinic(true) },
      ],
    },
    {
      title: t('settings.group.procedures'),
      items: [
        { label: t('settings.procedures'), icon: 'list-outline', onPress: () => setShowProcedures(true) },
      ],
    },
    {
      title: t('settings.group.configuration'),
      items: [
        { label: t('settings.registrations'), icon: 'list-outline', onPress: comingSoon(t('settings.registrations')) },
        { label: t('settings.integrations'), icon: 'link-outline', onPress: comingSoon(t('settings.integrations')) },
        { label: t('settings.patientData'), icon: 'people-outline', onPress: comingSoon(t('settings.patientData')) },
        { label: t('settings.workingHours'), icon: 'calendar-outline', onPress: () => setShowWorkingHours(true) },
        { label: t('settings.medicalRecords'), icon: 'document-text-outline', onPress: comingSoon(t('settings.medicalRecords')) },
        { label: t('settings.modules'), icon: 'grid-outline', onPress: comingSoon(t('settings.modules')) },
        { label: t('settings.documentTemplates'), icon: 'color-palette-outline', onPress: () => setShowDocumentTemplates(true) },
        { label: t('settings.documents'), icon: 'folder-outline', onPress: comingSoon(t('settings.documents')) },
      ],
    },
    {
      title: t('settings.group.language'),
      items: [
        {
          label: t('settings.language'),
          icon: 'language-outline',
          detail: LANGUAGE_NAMES[locale] ?? locale,
          onPress: () => setShowLanguagePicker(true),
        },
      ],
    },
    {
      title: t('settings.group.support'),
      items: [
        { label: t('settings.help'), icon: 'help-circle-outline', onPress: comingSoon(t('settings.help')) },
        { label: t('settings.about'), icon: 'information-circle-outline', onPress: comingSoon(t('settings.about')) },
      ],
    },
  ];

  const displayName = professional?.fullName || t('settings.profilePlaceholder');
  const displaySpecialty = professional?.specialty || t('settings.profileSubPlaceholder');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile summary */}
        <TouchableOpacity style={styles.profileCard} onPress={() => setShowProfile(true)}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitial}>
              {displayName[0]?.toUpperCase() ?? 'D'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>
              {professional?.specialty ? professional.specialty : user?.email ?? displaySpecialty}
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
                >
                  <View style={styles.settingIcon}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  {item.detail ? <Text style={styles.settingDetail}>{item.detail}</Text> : null}
                  <Ionicons name="chevron-forward" size={16} color={item.onPress ? Colors.textMuted : Colors.border} />
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
  groupTitle: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginLeft: 4 },
  groupCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  settingDetail: { fontSize: 13, color: Colors.textSecondary, marginRight: 4 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 14, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  signOutText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
});
