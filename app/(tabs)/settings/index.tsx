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

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingItem { label: string; icon: IoniconName; onPress?: () => void; }
interface SettingGroup { title: string; items: SettingItem[]; }

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showDocumentTemplates, setShowDocumentTemplates] = useState(false);
  const [showProcedures, setShowProcedures] = useState(false);
  const [showMyClinic, setShowMyClinic] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProfessional(user.id).then(setProfessional).catch(() => {});
  }, [user]);

  function comingSoon(label: string) {
    return () => Alert.alert(label, 'This feature is coming soon.', [{ text: 'OK' }]);
  }

  const SETTINGS: SettingGroup[] = [
    {
      title: 'Profile',
      items: [
        { label: 'My Profile', icon: 'person-outline', onPress: () => setShowProfile(true) },
        { label: 'My Clinic', icon: 'business-outline', onPress: () => setShowMyClinic(true) },
      ],
    },
    {
      title: 'My Procedures',
      items: [
        { label: 'Manage Procedures', icon: 'list-outline', onPress: () => setShowProcedures(true) },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { label: 'Registrations', icon: 'list-outline', onPress: comingSoon('Registrations') },
        { label: 'Integrations', icon: 'link-outline', onPress: comingSoon('Integrations') },
        { label: 'Patient Data', icon: 'people-outline', onPress: comingSoon('Patient Data') },
        { label: 'Working Hours', icon: 'calendar-outline', onPress: () => setShowWorkingHours(true) },
        { label: 'Medical Records', icon: 'document-text-outline', onPress: comingSoon('Medical Records') },
        { label: 'Modules', icon: 'grid-outline', onPress: comingSoon('Modules') },
        { label: 'Document Templates', icon: 'color-palette-outline', onPress: () => setShowDocumentTemplates(true) },
        { label: 'Documents', icon: 'folder-outline', onPress: comingSoon('Documents') },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Help', icon: 'help-circle-outline', onPress: comingSoon('Help') },
        { label: 'About SolvyMed', icon: 'information-circle-outline', onPress: comingSoon('About SolvyMed') },
      ],
    },
  ];

  const displayName = professional?.fullName || 'Dr. Professional';
  const displaySpecialty = professional?.specialty || 'Complete your profile';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
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
              {professional?.specialty ? professional.specialty : user?.email ?? 'Not signed in'}
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
                  <Ionicons name="chevron-forward" size={16} color={item.onPress ? Colors.textMuted : Colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
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
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 14, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  signOutText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
});
