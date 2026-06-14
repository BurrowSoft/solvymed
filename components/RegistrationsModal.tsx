import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';

const STORAGE_KEY = 'professional_credentials';

interface Credentials {
  crm: string;
  crmState: string;
  rqe: string;
  cnes: string;
  ansCode: string;
  cbhpmCode: string;
  additionalCouncil: string;
  additionalCouncilNumber: string;
}

const EMPTY: Credentials = {
  crm: '', crmState: '', rqe: '', cnes: '', ansCode: '',
  cbhpmCode: '', additionalCouncil: '', additionalCouncilNumber: '',
};

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

interface Props { visible: boolean; onClose: () => void; }

export function RegistrationsModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const [creds, setCreds] = useState<Credentials>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (v) setCreds(JSON.parse(v)); })
      .catch(() => {});
  }, [visible]);

  function set(field: keyof Credentials, value: string) {
    setCreds(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
      Alert.alert('', t('registrations.saved'));
      onClose();
    } catch {
      Alert.alert('', t('registrations.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('settings.registrations')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.primary} />
              <Text style={styles.infoText}>{t('registrations.info')}</Text>
            </View>

            {/* Medical Council */}
            <Text style={styles.sectionLabel}>Conselho de Classe (CRM / CRO / CRP…)</Text>
            <View style={styles.row2}>
              <View style={{ flex: 2 }}>
                <Text style={styles.fieldLabel}>Número</Text>
                <TextInput
                  style={styles.input}
                  value={creds.crm}
                  onChangeText={v => set('crm', v)}
                  placeholder="123456"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Estado</Text>
                <TouchableOpacity style={styles.stateBtn} onPress={() => setShowStatePicker(true)}>
                  <Text style={[styles.stateBtnText, !creds.crmState && { color: Colors.textMuted }]}>
                    {creds.crmState || 'UF'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* RQE */}
            <Text style={styles.fieldLabel}>RQE (Registro de Qualificação de Especialidade)</Text>
            <TextInput
              style={styles.input}
              value={creds.rqe}
              onChangeText={v => set('rqe', v)}
              placeholder="Ex: 12345"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {/* CNES */}
            <Text style={styles.fieldLabel}>CNES (Cadastro Nacional de Estabelecimentos de Saúde)</Text>
            <TextInput
              style={styles.input}
              value={creds.cnes}
              onChangeText={v => set('cnes', v)}
              placeholder="7 dígitos"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              maxLength={7}
            />

            {/* ANS */}
            <Text style={styles.fieldLabel}>Código da Operadora ANS</Text>
            <TextInput
              style={styles.input}
              value={creds.ansCode}
              onChangeText={v => set('ansCode', v)}
              placeholder="Ex: 302147"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {/* CBHPM */}
            <Text style={styles.fieldLabel}>Código CBHPM (procedimento padrão)</Text>
            <TextInput
              style={styles.input}
              value={creds.cbhpmCode}
              onChangeText={v => set('cbhpmCode', v)}
              placeholder="Ex: 31303012"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />

            {/* Additional council */}
            <Text style={styles.sectionLabel}>Outro conselho (CRN, CRO, CFP…)</Text>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Conselho</Text>
                <TextInput
                  style={styles.input}
                  value={creds.additionalCouncil}
                  onChangeText={v => set('additionalCouncil', v)}
                  placeholder="CRN"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.fieldLabel}>Número</Text>
                <TextInput
                  style={styles.input}
                  value={creds.additionalCouncilNumber}
                  onChangeText={v => set('additionalCouncilNumber', v)}
                  placeholder="Número de registro"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Salvando…' : t('common.save')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* State picker */}
      <Modal visible={showStatePicker} transparent animationType="fade" onRequestClose={() => setShowStatePicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowStatePicker(false)}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Selecionar estado</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {BR_STATES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pickerItem, creds.crmState === s && styles.pickerItemActive]}
                  onPress={() => { set('crmState', s); setShowStatePicker(false); }}
                >
                  <Text style={[styles.pickerItemText, creds.crmState === s && { color: Colors.primary }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  fieldLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },

  row2: { flexDirection: 'row', gap: 10 },

  input: {
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: Colors.textPrimary,
  },
  stateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11,
  },
  stateBtnText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },

  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  pickerBox: {
    backgroundColor: Colors.surface, borderRadius: 16, width: 200,
    padding: 16, maxHeight: 380,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  pickerItemActive: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: 14, color: Colors.textPrimary },
});
