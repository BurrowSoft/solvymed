import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/auth-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingItem { label: string; icon: IoniconName; }
interface SettingGroup { title: string; items: SettingItem[]; }

const SETTINGS: SettingGroup[] = [
  {
    title: 'Profile',
    items: [
      { label: 'My Profile', icon: 'person-outline' },
      { label: 'My Clinic', icon: 'business-outline' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Registrations', icon: 'list-outline' },
      { label: 'Integrations', icon: 'link-outline' },
      { label: 'Patient Data', icon: 'people-outline' },
      { label: 'Schedule', icon: 'calendar-outline' },
      { label: 'Medical Records', icon: 'document-text-outline' },
      { label: 'Modules', icon: 'grid-outline' },
      { label: 'Documents', icon: 'folder-outline' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Help', icon: 'help-circle-outline' },
      { label: 'About SolvyMed', icon: 'information-circle-outline' },
    ],
  },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile summary */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={28} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Dr. Professional</Text>
            <Text style={styles.profileEmail}>{user?.email ?? 'Not signed in'}</Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {SETTINGS.map(group => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.settingRow, i < group.items.length - 1 && styles.settingRowBorder]}
                >
                  <View style={styles.settingIcon}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
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
  profileName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  profileEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
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
