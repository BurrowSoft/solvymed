import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Linking,
  TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, Image, Pressable,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Patient, MedicalRecord, Prescription, Appointment, PatientFile } from '@/lib/types';
import { MOCK_PATIENTS, MOCK_RECORDS, MOCK_APPOINTMENTS } from '@/lib/mock-data';
import {
  getPatients, getRecords, updatePatient, getPrescriptions,
  getPatientAppointments, uploadPatientPhoto,
  getPatientFiles, uploadPatientFile, deletePatientFile,
  getProfessional, deletePatient,
} from '@/lib/services';
import { getTemplate } from '@/lib/template-service';
import { buildPrescriptionHtml, buildMedicalHistoryHtml } from '@/lib/pdf-utils';
import { useAuth } from '@/lib/auth-context';
import { NewPatientModal } from '@/components/NewPatientModal';
import { NewRecordModal } from '@/components/NewRecordModal';
import { NewPrescriptionModal } from '@/components/NewPrescriptionModal';

type PatientTab = 'info' | 'records' | 'prescriptions' | 'exams' | 'appointments' | 'files';

const TABS: { key: PatientTab; label: string }[] = [
  { key: 'info', label: 'Patient Info' },
  { key: 'records', label: 'Records' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'exams', label: 'Exams' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'files', label: 'Files' },
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
  const [recentAppts, setRecentAppts] = useState<Appointment[]>([]);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

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

  const [photoUrl, setPhotoUrl] = useState<string | undefined>(patient.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function pickAndUploadPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload a patient photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !user) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const url = await uploadPatientPhoto(user.id, patient.id, asset.uri, asset.mimeType ?? 'image/jpeg');
      await updatePatient(patient.id, { photoUrl: url });
      setPhotoUrl(url);
      onUpdate({ ...patient, photoUrl: url });
    } catch {
      Alert.alert('Upload failed', 'Make sure the "patient-photos" Storage bucket is created and public.');
    } finally {
      setUploadingPhoto(false);
    }
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

  useEffect(() => {
    if (!user) {
      setRecentAppts(MOCK_APPOINTMENTS.filter(a => a.patientId === patient.id).slice(0, 4));
      return;
    }
    getPatientAppointments(patient.id)
      .then(all => setRecentAppts(all.slice(0, 4)))
      .catch(() => setRecentAppts([]));
  }, [patient.id, user]);

  useEffect(() => {
    if (!user) return;
    getProfessional(user.id)
      .then(p => setProfessionalName(p?.fullName ?? ''))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (activeTab !== 'files') return;
    if (!user) { setFiles([]); return; }
    setLoadingFiles(true);
    getPatientFiles(user.id, patient.id)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [activeTab, patient.id, user]);

  async function pickAndUploadFile() {
    if (!user) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingFile(true);
    try {
      await uploadPatientFile(user.id, patient.id, asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
      const updated = await getPatientFiles(user.id, patient.id);
      setFiles(updated);
    } catch {
      Alert.alert('Upload failed', 'Make sure the "patient-files" Storage bucket is created and public.');
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleDeleteFile(file: PatientFile) {
    Alert.alert('Delete file', `Remove "${file.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePatientFile(file.storagePath);
            setFiles(prev => prev.filter(f => f.storagePath !== file.storagePath));
          } catch {
            Alert.alert('Error', 'Could not delete the file.');
          }
        },
      },
    ]);
  }

  async function handleShareFile(file: PatientFile) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.url, { dialogTitle: file.name });
      }
    } catch {
      Alert.alert('Error', 'Could not share the file.');
    }
  }

  const [exportingHistory, setExportingHistory] = useState(false);
  const [professionalName, setProfessionalName] = useState<string>('');

  async function exportHistory() {
    if (!user) return;
    setExportingHistory(true);
    try {
      const [allRecords, allPrescriptions, professional, template] = await Promise.all([
        getRecords(patient.id).catch(() => records),
        getPrescriptions(patient.id).catch(() => prescriptions),
        getProfessional(user.id),
        getTemplate(user.id, 'medical_record').catch(() => null),
      ]);
      const fallbackTemplate = { professionalId: user.id, documentType: 'medical_record' as const, primaryColor: '#208AEF', accentColor: '#E8F4FE' };
      const html = buildMedicalHistoryHtml(
        patient,
        allRecords,
        allPrescriptions,
        professional ?? { id: user.id, fullName: '', email: '' },
        template ?? fallbackTemplate,
      );
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${patient.fullName} — Medical History` });
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      Alert.alert('Error', 'Could not generate PDF. Please try again.');
    } finally {
      setExportingHistory(false);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.exportBtn} onPress={exportHistory} disabled={exportingHistory}>
                {exportingHistory
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={enterEdit}>
                <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
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
                <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
                  <View style={styles.avatar}>
                    {photoUrl ? (
                      <Image source={{ uri: photoUrl }} style={styles.avatarPhoto} />
                    ) : (
                      <Text style={styles.avatarInitial}>{patient.fullName[0]?.toUpperCase()}</Text>
                    )}
                    <View style={styles.avatarCameraBtn}>
                      {uploadingPhoto
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="camera" size={12} color="#fff" />
                      }
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {recentAppts.length > 0 && (
                <View style={styles.timelineSection}>
                  <Text style={styles.timelineTitle}>Recent Appointments</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
                    {recentAppts.map(appt => (
                      <View key={appt.id} style={styles.timelineCard}>
                        <View style={[styles.timelineDot, { backgroundColor: apptStatusColor(appt.status) }]} />
                        <Text style={styles.timelineDate}>{appt.date.slice(5).replace('-', '/')}</Text>
                        <Text style={styles.timelineType} numberOfLines={1}>{appt.consultationType}</Text>
                        <Text style={[styles.timelineStatus, { color: apptStatusColor(appt.status) }]}>
                          {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

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
                        <Text style={styles.recordMeta}>{professionalName ? `Dr. ${professionalName.split(' ')[0]}` : 'Unknown'}</Text>
                        <Text style={styles.recordTime}>{record.date} · {record.time} · {record.recordType ?? 'Free text'}</Text>
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

          {/* ── Files Tab ── */}
          {activeTab === 'files' && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.newItemBtn} onPress={pickAndUploadFile} disabled={uploadingFile}>
                {uploadingFile
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
                }
                <Text style={styles.newItemText}>{uploadingFile ? 'Uploading…' : 'Upload File'}</Text>
              </TouchableOpacity>

              {loadingFiles ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
              ) : files.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No files yet</Text>
                  <Text style={styles.emptySubText}>Upload PDFs, images, or other documents</Text>
                </View>
              ) : (
                files.map(file => (
                  <View key={file.storagePath} style={styles.fileCard}>
                    <View style={styles.fileIcon}>
                      <Ionicons
                        name={file.mimeType.startsWith('image/') ? 'image-outline' : file.mimeType === 'application/pdf' ? 'document-text-outline' : 'document-outline'}
                        size={22}
                        color={Colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileMeta}>
                        {formatFileSize(file.size)} · {file.createdAt.slice(0, 10)}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.fileActionBtn} onPress={() => handleShareFile(file)}>
                      <Ionicons name="share-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.fileActionBtn} onPress={() => handleDeleteFile(file)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
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

const PAGE_SIZE = 30;

export default function PatientsScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSex, setFilterSex] = useState<'male' | 'female' | 'other' | ''>('');

  const activeFilterCount = filterSex ? 1 : 0;

  const loadPatients = useCallback(async () => {
    if (!user) {
      const mock = MOCK_PATIENTS.filter(p =>
        !search || p.fullName.toLowerCase().includes(search.toLowerCase()),
      );
      setPatients(mock);
      setHasMore(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getPatients(user.id, search || undefined, { sex: filterSex || undefined, offset: 0, limit: PAGE_SIZE });
      setPatients(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setPatients(MOCK_PATIENTS);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [user, search, filterSex]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  async function loadMore() {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await getPatients(user.id, search || undefined, { sex: filterSex || undefined, offset: patients.length, limit: PAGE_SIZE });
      setPatients(prev => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }

  function openPatientMenu(patient: Patient) {
    Alert.alert(patient.fullName, '', [
      {
        text: 'Open profile',
        onPress: () => setSelected(patient),
      },
      {
        text: 'Delete patient',
        style: 'destructive',
        onPress: () => Alert.alert(
          'Delete patient?',
          'All their records will be permanently deleted.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                if (user) await deletePatient(patient.id).catch(() => {});
                setPatients(prev => prev.filter(p => p.id !== patient.id));
              },
            },
          ],
        ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const filtered = patients;

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
        <View style={[styles.searchBox, { flex: 1 }]}>
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
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(true)}>
          <Ionicons name="filter-outline" size={18} color={activeFilterCount > 0 ? Colors.primary : Colors.textSecondary} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={Colors.primary} /> : null}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No patients found</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.patientRow} onPress={() => setSelected(item)}>
              <View style={styles.patientAvatar}>
                {item.photoUrl
                  ? <Image source={{ uri: item.photoUrl }} style={styles.patientPhoto} />
                  : <Text style={styles.patientInitial}>{item.fullName[0]?.toUpperCase()}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.patientName}>{item.fullName}</Text>
                  {item.phone && (
                    <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                  )}
                </View>
                <Text style={styles.patientMeta}>
                  {[
                    item.birthDate && `${getAge(item.birthDate)} yrs`,
                    item.phone,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => openPatientMenu(item)}
                style={{ padding: 6 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="ellipsis-vertical" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
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

      {/* Filter sheet */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setShowFilter(false)}>
          <Pressable style={styles.filterSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filters</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={() => setFilterSex('')}>
                  <Text style={{ fontSize: 13, color: Colors.danger, fontWeight: '500' }}>Clear all</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.filterLabel}>Sex</Text>
            <View style={styles.filterPillRow}>
              {([['', 'All'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.filterPill, filterSex === val && styles.filterPillActive]}
                  onPress={() => setFilterSex(val)}
                >
                  <Text style={[styles.filterPillText, filterSex === val && styles.filterPillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={() => setShowFilter(false)}>
              <Text style={styles.filterApplyText}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  searchRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 10, gap: 6, height: 38 },
  filterBtn: { padding: 6, position: 'relative' },
  filterBadge: { position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 8, color: '#fff', fontWeight: '700' },
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterSheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  filterLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  filterPillTextActive: { color: '#fff' },
  filterApplyBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  filterApplyText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  patientRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: Colors.surface, gap: 12 },
  patientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  patientInitial: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  patientName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  patientMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  emptySubText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  // Detail screen
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  backBtn: { padding: 4 },
  detailName: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.primaryLight },
  exportBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
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
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  avatarPhoto: { width: 72, height: 72, borderRadius: 36 },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  avatarCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  patientPhoto: { width: 40, height: 40, borderRadius: 20 },
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

  // Timeline strip
  timelineSection: { marginBottom: 16 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  timelineScroll: { gap: 10, paddingRight: 4 },
  timelineCard: { width: 100, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: Colors.border },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDate: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  timelineType: { fontSize: 11, color: Colors.textSecondary },
  timelineStatus: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  // Files tab
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  fileIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  fileMeta: { fontSize: 11, color: Colors.textSecondary },
  fileActionBtn: { padding: 6 },
});
