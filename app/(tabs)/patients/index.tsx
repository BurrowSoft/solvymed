import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Patient, MedicalRecord } from '@/lib/types';
import { MOCK_PATIENTS, MOCK_RECORDS } from '@/lib/mock-data';
import { getPatients, getRecords } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';

type PatientTab = 'info' | 'records' | 'prescriptions' | 'exams' | 'files';

const TABS: { key: PatientTab; label: string }[] = [
  { key: 'info', label: 'Patient Info' },
  { key: 'records', label: 'Records' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'exams', label: 'Exams' },
  { key: 'files', label: 'Files' },
];

function getAge(birthDate?: string) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return years;
}

function PatientDetail({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PatientTab>('info');
  const [records, setRecords] = useState<MedicalRecord[]>([]);

  useEffect(() => {
    if (!user) { setRecords(MOCK_RECORDS.filter(r => r.patientId === patient.id)); return; }
    getRecords(patient.id).then(setRecords).catch(() => {
      setRecords(MOCK_RECORDS.filter(r => r.patientId === patient.id));
    });
  }, [patient.id, user]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.detailContainer} edges={['top']}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.detailName} numberOfLines={1}>{patient.fullName}</Text>
          <TouchableOpacity style={styles.moreBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
          {activeTab === 'info' && (
            <View style={styles.section}>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={32} color={Colors.textMuted} />
                </View>
              </View>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              <View style={styles.fieldGrid}>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.fullName}</Text></View>
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>CPF</Text>
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.cpf ?? '—'}</Text></View>
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Sex</Text>
                  <View style={styles.fieldBox}>
                    <Text style={styles.fieldValue}>
                      {patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : '—'}
                    </Text>
                  </View>
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  <View style={styles.fieldBox}>
                    <Text style={styles.fieldValue}>{patient.birthDate ?? '—'}</Text>
                  </View>
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Age</Text>
                  <View style={styles.fieldBox}>
                    <Text style={styles.fieldValue}>{getAge(patient.birthDate) ?? '—'} yrs</Text>
                  </View>
                </View>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Profession</Text>
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.profession ?? '—'}</Text></View>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Contact</Text>
              <View style={styles.fieldGrid}>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.email ?? '—'}</Text></View>
                </View>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Phone</Text>
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.phone ?? '—'}</Text></View>
                </View>
              </View>
            </View>
          )}

          {activeTab === 'records' && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.newRecordBtn}>
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.newRecordText}>New Record</Text>
              </TouchableOpacity>
              {records.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No records yet</Text>
                </View>
              ) : (
                records.map(record => (
                  <View key={record.id} style={styles.recordCard}>
                    <View style={styles.recordHeader}>
                      <View style={styles.recordBadge}>
                        <Text style={styles.recordBadgeText}>
                          {Math.floor((Date.now() - new Date(record.createdAt).getTime()) / 86400000)}d
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recordMeta}>By: Professional</Text>
                        <Text style={styles.recordTime}>{record.time} · Free text record</Text>
                      </View>
                    </View>
                    <Text style={styles.recordContent}>{record.content}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {(activeTab === 'prescriptions' || activeTab === 'exams' || activeTab === 'files') && (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No {activeTab} yet</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function PatientsScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPatients = useCallback(async () => {
    if (!user) { setPatients(MOCK_PATIENTS); return; }
    setLoading(true);
    try {
      const data = await getPatients(user.id, search || undefined);
      setPatients(data);
    } catch {
      setPatients(MOCK_PATIENTS);
    } finally {
      setLoading(false);
    }
  }, [user, search]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const filtered = user
    ? patients
    : MOCK_PATIENTS.filter(p => p.fullName.toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Patients</Text>
        <TouchableOpacity style={styles.addBtn}>
          <Ionicons name="add" size={20} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search patient"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="options-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.filterText}>Filter</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.patientRow} onPress={() => setSelected(item)}>
            <View style={styles.patientAvatar}>
              <Text style={styles.patientInitial}>{item.fullName[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{item.fullName}</Text>
              {item.birthDate && (
                <Text style={styles.patientMeta}>{getAge(item.birthDate)} yrs old</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />

      {selected && <PatientDetail patient={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 10, gap: 6, height: 38 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, backgroundColor: Colors.background, borderRadius: 10, height: 38 },
  filterText: { fontSize: 13, color: Colors.textSecondary },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  patientRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: Colors.surface, gap: 12 },
  patientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  patientInitial: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  patientName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  patientMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  backBtn: { padding: 4 },
  detailName: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  moreBtn: { padding: 4 },
  tabRow: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  detailBody: { flex: 1 },
  section: { padding: 16 },
  avatarRow: { alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  fieldGrid: { gap: 10 },
  fieldFull: { gap: 4 },
  fieldHalf: { gap: 4 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldBox: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  fieldValue: { fontSize: 14, color: Colors.textPrimary },
  newRecordBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 12, backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  newRecordText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  recordCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  recordHeader: { flexDirection: 'row', gap: 10 },
  recordBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  recordBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recordMeta: { fontSize: 11, color: Colors.textMuted },
  recordTime: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  recordContent: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
