import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/Colors';
import { Professional } from '@/lib/types';
import { getProfessional, upsertProfessional, uploadProfilePhoto } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

const SPECIALTIES = [
  'General Practitioner', 'Cardiologist', 'Dermatologist', 'Orthopedist',
  'Pediatrician', 'Psychiatrist', 'Neurologist', 'Gynecologist',
  'Endocrinologist', 'Ophthalmologist',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (professional: Professional) => void;
}

export function ProfileModal({ visible, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [showSpecialtyPicker, setShowSpecialtyPicker] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    getProfessional(user.id)
      .then(prof => {
        if (prof) {
          setFullName(prof.fullName);
          setSpecialty(prof.specialty ?? '');
          setClinicName(prof.clinicName ?? '');
          setPhotoUrl(prof.photoUrl);
        } else {
          setFullName('');
          setSpecialty('');
          setClinicName('');
          setPhotoUrl(undefined);
        }
        setPhotoUri(null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, user]);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('profile.photoPermissionTitle'), t('profile.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!fullName.trim()) { setError(t('profile.nameRequired')); return; }
    if (!user) return;
    setError('');
    setSaving(true);
    try {
      let newPhotoUrl = photoUrl;
      if (photoUri) {
        const mimeType = photoUri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        try {
          newPhotoUrl = await uploadProfilePhoto(user.id, photoUri, mimeType);
        } catch {
          Alert.alert(t('profile.photoUploadFailed'));
          setSaving(false);
          return;
        }
      }
      const saved = await upsertProfessional(user.id, user.email ?? '', {
        fullName: fullName.trim(),
        specialty: specialty.trim() || undefined,
        clinicName: clinicName.trim() || undefined,
        photoUrl: newPhotoUrl,
      });
      onSaved(saved);
      onClose();
    } catch {
      setError(t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const displayPhoto = photoUri ?? photoUrl;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('settings.myProfile')}</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving || loading}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.avatarSection}>
                <TouchableOpacity style={styles.avatarWrapper} onPress={pickPhoto}>
                  {displayPhoto ? (
                    <Image source={{ uri: displayPhoto }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarInitial}>
                        {fullName ? fullName[0].toUpperCase() : '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.avatarEditBadge}>
                    <Ionicons name="camera-outline" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.changePhotoText}>{t('profile.changePhoto')}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('profile.section.professional')}</Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('profile.fullName')} <Text style={styles.required}>*</Text></Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder={t('profile.fullNamePlaceholder')}
                      placeholderTextColor={Colors.textMuted}
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('profile.email')}</Text>
                  <View style={[styles.inputBox, styles.readOnly]}>
                    <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                    <Text style={[styles.input, { color: Colors.textSecondary }]}>{user?.email}</Text>
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.textMuted} />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('profile.specialty')}</Text>
                  <TouchableOpacity
                    style={styles.inputBox}
                    onPress={() => setShowSpecialtyPicker(!showSpecialtyPicker)}
                  >
                    <Ionicons name="medkit-outline" size={16} color={Colors.textMuted} />
                    <Text style={[styles.input, !specialty && { color: Colors.textMuted }]}>
                      {specialty || t('profile.specialtyPlaceholder')}
                    </Text>
                    <Ionicons name={showSpecialtyPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showSpecialtyPicker && (
                    <View style={styles.picker}>
                      {SPECIALTIES.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.pickerItem, specialty === s && styles.pickerItemActive]}
                          onPress={() => { setSpecialty(s); setShowSpecialtyPicker(false); }}
                        >
                          <Text style={[styles.pickerItemText, specialty === s && styles.pickerItemTextActive]}>{s}</Text>
                          {specialty === s && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.pickerItem}
                        onPress={() => { setSpecialty(''); setShowSpecialtyPicker(false); }}
                      >
                        <Text style={styles.pickerItemText}>{t('profile.specialtyOther')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!showSpecialtyPicker && (
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        placeholder={t('profile.specialtyTypePlaceholder')}
                        placeholderTextColor={Colors.textMuted}
                        value={specialty}
                        onChangeText={setSpecialty}
                      />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('profile.section.clinic')}</Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('profile.clinicName')}</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('profile.clinicNamePlaceholder')}
                      placeholderTextColor={Colors.textMuted}
                      value={clinicName}
                      onChangeText={setClinicName}
                    />
                  </View>
                </View>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  errorText: { color: Colors.danger, fontSize: 13, marginHorizontal: 16, marginTop: 12 },
  avatarSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: Colors.surface, gap: 8 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: Colors.primary },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surface,
  },
  changePhotoText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  section: { backgroundColor: Colors.surface, marginTop: 12, paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  required: { color: Colors.danger },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, gap: 8, backgroundColor: Colors.background,
  },
  readOnly: { backgroundColor: Colors.background, opacity: 0.7 },
  input: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  picker: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.surface, overflow: 'hidden', marginTop: -4 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerItemActive: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: 14, color: Colors.textPrimary },
  pickerItemTextActive: { color: Colors.primary, fontWeight: '600' },
});
