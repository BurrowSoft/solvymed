import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Clinic } from '@/lib/types';
import { getClinicsByProfessional, createClinic, deleteClinic, geocodeAddress } from '@/lib/discovery-service';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

interface Props {
  visible: boolean;
  professional: unknown;
  onClose: () => void;
  onSaved: (updated: unknown) => void;
}

const EMPTY_FORM = { name: '', address: '', city: '', state: '', country: 'BR', phone: '' };

export function MyClinicModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getClinicsByProfessional(user.id);
      setClinics(data);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (visible) load();
    else { setShowForm(false); setForm(EMPTY_FORM); }
  }, [visible, load]);

  async function handleAdd() {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      const fullAddress = [form.address, form.city, form.state, form.country].filter(Boolean).join(', ');
      if (fullAddress.trim()) {
        const coords = await geocodeAddress(fullAddress);
        if (coords) { lat = coords.lat; lng = coords.lng; }
      }
      const created = await createClinic(user.id, {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        country: form.country.trim() || 'BR',
        phone: form.phone.trim() || undefined,
        lat,
        lng,
      });
      setClinics(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch {
      Alert.alert('Error', 'Could not save clinic. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clinic: Clinic) {
    Alert.alert(
      t('clinic.deleteTitle' as any) || 'Remove Clinic',
      `Remove "${clinic.name}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete') || 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(clinic.id);
            try {
              await deleteClinic(clinic.id);
              setClinics(prev => prev.filter(c => c.id !== clinic.id));
            } catch {}
            setDeletingId(null);
          },
        },
      ],
    );
  }

  function setField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t('clinic.title')}</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => { setShowForm(v => !v); setForm(EMPTY_FORM); }}
            >
              <Ionicons name={showForm ? 'remove' : 'add'} size={16} color="#fff" />
              <Text style={styles.addBtnText}>{t('clinic.add') || 'Add'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Add form */}
            {showForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>{t('clinic.newClinic') || 'New Clinic'}</Text>

                <Text style={styles.label}>{t('clinic.nameLabel') || t('clinic.name')} *</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. SolvyMed Clinic"
                    placeholderTextColor={Colors.textMuted}
                    value={form.name}
                    onChangeText={v => setField('name', v)}
                  />
                </View>

                <Text style={styles.label}>{t('clinic.addressLabel') || t('clinic.address')}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="Av. Paulista, 1000 — Sala 42"
                    placeholderTextColor={Colors.textMuted}
                    value={form.address}
                    onChangeText={v => setField('address', v)}
                  />
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>{t('clinic.cityLabel') || t('clinic.city')}</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        placeholder="São Paulo"
                        placeholderTextColor={Colors.textMuted}
                        value={form.city}
                        onChangeText={v => setField('city', v)}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{t('clinic.stateLabel') || t('clinic.state')}</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        placeholder="SP"
                        placeholderTextColor={Colors.textMuted}
                        value={form.state}
                        onChangeText={v => setField('state', v.toUpperCase().slice(0, 2))}
                        autoCapitalize="characters"
                        maxLength={2}
                      />
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>{t('clinic.countryLabel') || 'Country'}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="BR"
                    placeholderTextColor={Colors.textMuted}
                    value={form.country}
                    onChangeText={v => setField('country', v)}
                    autoCapitalize="characters"
                    maxLength={3}
                  />
                </View>

                <Text style={styles.label}>{t('clinic.phoneLabel') || t('clinic.phone')}</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="+55 (11) 99999-9999"
                    placeholderTextColor={Colors.textMuted}
                    value={form.phone}
                    onChangeText={v => setField('phone', v)}
                    keyboardType="phone-pad"
                  />
                </View>

                <Text style={styles.geocodeHint}>
                  📍 Address will be geocoded so patients can find your clinic on the map.
                </Text>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.saveFormBtn, (!form.name.trim() || saving) && { opacity: 0.5 }]}
                    onPress={handleAdd}
                    disabled={!form.name.trim() || saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.saveFormBtnText}>{t('common.save')}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                    <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Loading */}
            {loading && (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}

            {/* Empty state */}
            {!loading && clinics.length === 0 && !showForm && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="location-outline" size={28} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>{t('clinic.empty') || 'No clinics yet'}</Text>
                <Text style={styles.emptySubtitle}>
                  {t('clinic.emptySubtitle') || 'Add a clinic location to appear in search results.'}
                </Text>
                <TouchableOpacity
                  style={styles.addFirstBtn}
                  onPress={() => setShowForm(true)}
                >
                  <Text style={styles.addFirstBtnText}>{t('clinic.addFirst') || 'Add first clinic'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Clinic cards */}
            {!loading && clinics.length > 0 && (
              <View style={styles.list}>
                {clinics.map(clinic => (
                  <View key={clinic.id} style={styles.card}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{clinic.name}</Text>
                      <Text style={styles.cardAddress} numberOfLines={2}>
                        {[clinic.address, clinic.city, clinic.state, clinic.country].filter(Boolean).join(', ') || (t('clinic.noAddress') || 'No address')}
                      </Text>
                      {clinic.phone ? (
                        <Text style={styles.cardPhone}>{clinic.phone}</Text>
                      ) : null}
                      <View style={styles.mapBadgeRow}>
                        {clinic.lat && clinic.lng ? (
                          <View style={[styles.mapBadge, styles.mapBadgeOn]}>
                            <Ionicons name="location" size={11} color="#0d9488" />
                            <Text style={[styles.mapBadgeText, { color: '#0d9488' }]}>
                              {t('clinic.onMap') || 'On map'}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.mapBadge, styles.mapBadgeOff]}>
                            <Text style={[styles.mapBadgeText, { color: Colors.textMuted }]}>
                              {t('clinic.noMapPin') || 'No map pin'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(clinic)}
                      disabled={deletingId === clinic.id}
                    >
                      {deletingId === clinic.id
                        ? <ActivityIndicator size="small" color={Colors.danger} />
                        : <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                      }
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  body: { flex: 1 },
  formCard: {
    backgroundColor: Colors.surface, margin: 16,
    borderRadius: 16, padding: 16, gap: 4,
    borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', marginTop: 8 },
  inputBox: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, height: 44, backgroundColor: Colors.background,
    justifyContent: 'center', marginTop: 4,
  },
  input: { fontSize: 14, color: Colors.textPrimary },
  row: { flexDirection: 'row', gap: 10 },
  geocodeHint: { fontSize: 11, color: Colors.textMuted, marginTop: 10 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  saveFormBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, minWidth: 80, alignItems: 'center',
  },
  saveFormBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelText: { fontSize: 14, color: Colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    padding: 40, margin: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.border,
    borderRadius: 16, backgroundColor: Colors.surface,
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  addFirstBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  addFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardAddress: { fontSize: 13, color: Colors.textSecondary, marginTop: 3 },
  cardPhone: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  mapBadgeRow: { flexDirection: 'row', marginTop: 6 },
  mapBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  mapBadgeOn: { backgroundColor: '#f0fdfa' },
  mapBadgeOff: { backgroundColor: Colors.background },
  mapBadgeText: { fontSize: 11, fontWeight: '500' },
  deleteBtn: {
    padding: 6, marginTop: 2,
    borderRadius: 8,
  },
});
