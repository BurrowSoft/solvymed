import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Patient, MedicalRecord, Prescription, Appointment } from '@/lib/types';
import { MOCK_PATIENTS, MOCK_RECORDS, MOCK_APPOINTMENTS } from '@/lib/mock-data';
import { getPatients, getRecords, updatePatient, getPrescriptions, getPatientAppointments } from '@/lib/services';
import { getTemplate } from '@/lib/template-service';
import { buildPrescriptionHtml } from '@/lib/pdf-utils';
import { useAuth } from '@/lib/auth-context';
import { NewPatientModal } from '@/components/NewPatientModal';
import { NewRecordModal } from '@/components/NewRecordModal';
import { NewPrescriptionModal } from '@/components/NewPrescriptionModal';

type PatientTab = 'info' | 'records' | 'prescriptions' | 'exams' | 'appointments';

const TABS: { key: PatientTab; label: string }[] = [
  { key: 'info', label: 'Patient Info' },
  { key: 'records', label: 'Records' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'exams', label: 'Exams' },
  { key: 'appointments', label: 'Appointments' },
];

async function sharePrescription(patient: Patient, rx: Prescription, professionalId: string) {
  try {
    const template = await getTemplate(professionalId, 'prescription').catch(() => null);
    const fallbackTemplate = {
      professionalId,
      documentType: 'prescription' as const,
      primaryColor: '#208AEF',
      accentColor: '#E8F4FE',
    };
    const html = buildPrescriptionHtml(patient, rx, template ?? fallbackTemplate);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Prescription' });
    } else {
      await Print.printAsync({ html });
    }
  } catch {
    Alert.alert('Error', 'Could not generate PDF. Please try again.');
  }
}

function apptStatusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return '#208AEF';
    case 'completed': return '#22C55E';
    case 'cancelled': return '#EF4444';
    case 'blocked': return '#C8CDD8';
    default: return '#F59E0B';
  }
}

function getAge(birthDate?: string) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return years;
}

interface PatientDetailProps {
  patient: Patient;
  onClose: () => void;
  onUpdate: (updated: Patient) => void;
}

function PatientDetail({ patient, onClose, onUpdate }: PatientDetailProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PatientTab>('info');
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showNewPrescription, setShowNewPrescription] = useState(false);
  const [patientAppts, setPatientAppts] = useState<Appointment[]>([]);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState(patient.fullName);
  const [editPhone, setEditPhone] = useState(patient.phone ?? '');
  const [editEmail, setEditEmail] = useState(patient.email ?? '');
  const [editCpf, setEditCpf] = useState(patient.cpf ?? '');
  const [editSex, setEditSex] = useState(patient.sex);
  const [editBirthDate, setEditBirthDate] = useState(patient.birthDate ?? '');
  const [editProfession, setEditProfession] = useState(patient.profession ?? '');
  const [editTags, setEditTags] = useState<string[]>(patient.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  function enterEdit() {
    setEditName(patient.fullName);
    setEditPhone(patient.phone ?? '');
    setEditEmail(patient.email ?? '');
    setEditCpf(patient.cpf ?? '');
    setEditSex(patient.sex);
    setEditBirthDate(patient.birthDate ?? '');
    setEditProfession(patient.profession ?? '');
    setEditTags(patient.tags ?? []);
    setTagInput('');
    setEditing(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !editTags.includes(t)) setEditTags(prev => [...prev, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setEditTags(prev => prev.filter(t => t !== tag));
  }

  async function saveEdit() {
    setSaving(true);
    const updates: Partial<Patient> = {
      fullName: editName.trim(),
      phone: editPhone.trim() || undefined,
      email: editEmail.trim() || undefined,
      cpf: editCpf.trim() || undefined,
      sex: editSex,
      birthDate: editBirthDate.trim() || undefined,
      profession: editProfession.trim() || undefined,
      tags: editTags.length > 0 ? editTags : undefined,
    };
    try {
      if (user) await updatePatient(patient.id, updates);
      onUpdate({ ...patient, ...updates });
      setEditing(false);
    } catch {
      // keep editing on failure
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setRecords(MOCK_RECORDS.filter(r => r.patientId === patient.id));
      return;
    }
    getRecords(patient.id).then(setRecords).catch(() => {
      setRecords(MOCK_RECORDS.filter(r => r.patientId === patient.id));
    });
  }, [patient.id, user]);

  useEffect(() => {
    if (activeTab !== 'prescriptions') return;
    if (!user) { setPrescriptions([]); return; }
    getPrescriptions(patient.id).then(setPrescriptions).catch(() => setPrescriptions([]));
  }, [activeTab, patient.id, user]);

  useEffect(() => {
    if (activeTab !== 'appointments') return;
    if (!user) {
      setPatientAppts(MOCK_APPOINTMENTS.filter(a => a.patientId === patient.id));
      return;
    }
    getPatientAppointments(patient.id).then(setPatientAppts).catch(() => {
      setPatientAppts(MOCK_APPOINTMENTS.filter(a => a.patientId === patient.id));
    });
  }, [activeTab, patient.id, user]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.detailContainer} edges={['top']}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.detailName} numberOfLines={1}>{patient.fullName}</Text>
          {editing ? (
            <TouchableOpacity style={styles.saveEditBtn} onPress={saveEdit} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveEditBtnText}>Save</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={enterEdit}>
              <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { setActiveTab(tab.key); setEditing(false); }}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
          {/* ── Patient Info Tab ── */}
          {activeTab === 'info' && (
            <View style={styles.section}>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{patient.fullName[0]?.toUpperCase()}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Personal Information</Text>
              <View style={styles.fieldGrid}>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editName} onChangeText={setEditName} />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.fullName}</Text></View>
                  )}
                </View>

                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>CPF</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editCpf} onChangeText={setEditCpf} placeholder="000.000.000-00" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.cpf ?? '—'}</Text></View>
                  )}
                </View>

                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Sex</Text>
                  {editing ? (
                    <View style={styles.sexRow}>
                      {(['male', 'female', 'other'] as const).map(s => (
                        <TouchableOpacity key={s} onPress={() => setEditSex(editSex === s ? undefined : s)} style={[styles.sexPill, editSex === s && styles.sexPillActive]}>
                          <Text style={[styles.sexPillText, editSex === s && styles.sexPillTextActive]}>{s[0].toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.fieldBox}>
                      <Text style={styles.fieldValue}>
                        {patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : '—'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editBirthDate} onChangeText={setEditBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.birthDate ?? '—'}</Text></View>
                  )}
                </View>

                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Age</Text>
                  <View style={styles.fieldBox}>
                    <Text style={styles.fieldValue}>
                      {getAge(editing ? editBirthDate : patient.birthDate) != null
                        ? `${getAge(editing ? editBirthDate : patient.birthDate)} yrs`
                        : '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Profession</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editProfession} onChangeText={setEditProfession} placeholder="e.g. Engineer" placeholderTextColor={Colors.textMuted} />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.profession ?? '—'}</Text></View>
                  )}
                </View>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Contact</Text>
              <View style={styles.fieldGrid}>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editEmail} onChangeText={setEditEmail} placeholder="email@example.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.email ?? '—'}</Text></View>
                  )}
                </View>
                <View style={styles.fieldFull}>
                  <Text style={styles.fieldLabel}>Phone</Text>
                  {editing ? (
                    <View style={styles.editInput}>
                      <TextInput style={styles.editInputText} value={editPhone} onChangeText={setEditPhone} placeholder="+55 (11) 99999-9999" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
                    </View>
                  ) : (
                    <View style={styles.fieldBox}><Text style={styles.fieldValue}>{patient.phone ?? '—'}</Text></View>
                  )}
                </View>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Tags</Text>
              {editing ? (
                <View style={{ gap: 8 }}>
                  <View style={styles.tagsRow}>
                    {editTags.map(tag => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                        <TouchableOpacity onPress={() => removeTag(tag)}>
                          <Ionicons name="close" size={12} color={Colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <View style={styles.tagInputRow}>
                    <TextInput
                      style={styles.tagInput}
                      placeholder="Add tag..."
                      placeholderTextColor={Colors.textMuted}
                      value={tagInput}
                      onChangeText={setTagInput}
                      onSubmitEditing={addTag}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
                      <Ionicons name="add" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                (patient.tags ?? []).length > 0 ? (
                  <View style={styles.tagsRow}>
                    {(patient.tags ?? []).map(tag => (
                      <View key={tag} style={styles.tagChipRead}>
                        <Text style={styles.tagChipReadText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.fieldBox}><Text style={styles.fieldValue}>No tags</Text></View>
                )
              )}
            </View>
          )}

          {/* ── Records Tab ── */}
          {activeTab === 'records' && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.newItemBtn} onPress={() => setShowNewRecord(true)}>
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.newItemText}>New Record</Text>
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
                        <Text style={styles.recordTime}>{record.date} · {record.time} · Free text</Text>
                      </View>
                    </View>
                    <Text style={styles.recordContent}>{record.content}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── Prescriptions Tab ── */}
          {activeTab === 'prescriptions' && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.newItemBtn} onPress={() => setShowNewPrescription(true)}>
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.newItemText}>New Prescription</Text>
              </TouchableOpacity>
              {prescriptions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No prescriptions yet</Text>
                </View>
              ) : (
                prescriptions.map(rx => (
                  <View key={rx.id} style={styles.rxCard}>
                    <View style={styles.rxHeader}>
                      <Ionicons name="medical-outline" size={16} color={Colors.primary} />
                      <Text style={styles.rxDate}>{rx.date}</Text>
                      <View style={styles.rxBadge}>
                        <Text style={styles.rxBadgeText}>{rx.medications.length} med{rx.medications.length !== 1 ? 's' : ''}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.sharePdfBtn}
                        onPress={() => sharePrescription(patient, rx, user?.id ?? '')}
                      >
                        <Ionicons name="share-outline" size={14} color={Colors.primary} />
                        <Text style={styles.sharePdfText}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                    {rx.medications.map((med, i) => (
                      <View key={i} style={styles.medRow}>
                        <Text style={styles.medName}>{med.name}</Text>
                        <Text style={styles.medDetail}>
                          {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    ))}
                    {rx.notes ? <Text style={styles.rxNotes}>{rx.notes}</Text> : null}
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'exams' && (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No exams yet</Text>
            </View>
          )}

          {activeTab === 'appointments' && (
            <View style={styles.section}>
              {patientAppts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No appointments yet</Text>
                </View>
              ) : (
                patientAppts.map(appt => (
                  <View key={appt.id} style={styles.apptCard}>
                    <View style={styles.apptCardDate}>
                      <Text style={styles.apptCardDateText}>{appt.date.slice(5).replace('-', '/')}</Text>
                      <Text style={styles.apptCardTime}>{appt.startTime}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.apptCardType}>{appt.consultationType}</Text>
                      <Text style={styles.apptCardMeta}>
                        {appt.type === 'online' ? 'Online' : 'In-Person'}
                        {appt.paymentAmount ? ` · R$ ${appt.paymentAmount.toFixed(0)}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.apptStatusBadge, { backgroundColor: apptStatusColor(appt.status) + '20' }]}>
                      <Text style={[styles.apptStatusText, { color: apptStatusColor(appt.status) }]}>
                        {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        <NewRecordModal
          visible={showNewRecord}
          patientId={patient.id}
          patientName={patient.fullName}
          onClose={() => setShowNewRecord(false)}
          onSaved={(record) => setRecords(prev => [record, ...prev])}
        />

        <NewPrescriptionModal
          visible={showNewPrescription}
          patientId={patient.id}
          patientName={patient.fullName}
          onClose={() => setShowNewPrescription(false)}
          onSaved={(rx) => setPrescriptions(prev => [rx, ...prev])}
        />
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
  const [showNewPatient, setShowNewPatient] = useState(false);

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
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewPatient(true)}>
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
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No patients found</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.patientRow} onPress={() => setSelected(item)}>
              <View style={styles.patientAvatar}>
                <Text style={styles.patientInitial}>{item.fullName[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.patientName}>{item.fullName}</Text>
                <Text style={styles.patientMeta}>
                  {[
                    item.birthDate && `${getAge(item.birthDate)} yrs`,
                    item.phone,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {selected && (
        <PatientDetail
          patient={selected}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
            setSelected(updated);
          }}
        />
      )}

      <NewPatientModal
        visible={showNewPatient}
        onClose={() => setShowNewPatient(false)}
        onSaved={(patient) => setPatients(prev => [patient, ...prev])}
      />
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
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  patientRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: Colors.surface, gap: 12 },
  patientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  patientInitial: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  patientName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  patientMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted },

  // Detail screen
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  backBtn: { padding: 4 },
  detailName: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.primaryLight },
  editBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  saveEditBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, minWidth: 52, alignItems: 'center' },
  saveEditBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  tabRow: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  detailBody: { flex: 1 },
  section: { padding: 16 },
  avatarRow: { alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  fieldGrid: { gap: 10 },
  fieldFull: { gap: 4 },
  fieldHalf: { gap: 4 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldBox: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  fieldValue: { fontSize: 14, color: Colors.textPrimary },
  editInput: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, height: 42, backgroundColor: Colors.surface, justifyContent: 'center' },
  editInputText: { fontSize: 14, color: Colors.textPrimary },
  sexRow: { flexDirection: 'row', gap: 6 },
  sexPill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  sexPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sexPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  sexPillTextActive: { color: '#fff' },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary + '40', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  tagChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tagChipRead: { backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  tagChipReadText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagInput: { flex: 1, height: 38, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.background },
  tagAddBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },

  // Records
  newItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 12, backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  newItemText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  recordCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  recordHeader: { flexDirection: 'row', gap: 10 },
  recordBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  recordBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recordMeta: { fontSize: 11, color: Colors.textMuted },
  recordTime: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  recordContent: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Prescriptions
  rxCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  rxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rxDate: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  rxBadge: { backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  rxBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  medRow: { paddingLeft: 4, borderLeftWidth: 2, borderLeftColor: Colors.border, paddingVertical: 2 },
  medName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  medDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  rxNotes: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  sharePdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sharePdfText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  // Appointments tab
  apptCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  apptCardDate: { alignItems: 'center', minWidth: 44 },
  apptCardDateText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  apptCardTime: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  apptCardType: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  apptCardMeta: { fontSize: 12, color: Colors.textSecondary },
  apptStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  apptStatusText: { fontSize: 11, fontWeight: '600' },
});
