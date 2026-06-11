import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Procedure } from '@/lib/types';
import { getProcedures, createProcedure, updateProcedure, deleteProcedure } from '@/lib/services';
import { t } from '@/lib/i18n';

const DURATIONS = [15, 20, 30, 45, 50, 60, 90, 120];

interface FormState {
  name: string;
  durationMinutes: number;
  price: string;
  paymentType: 'private' | 'insurance';
}

const EMPTY_FORM: FormState = {
  name: '',
  durationMinutes: 50,
  price: '',
  paymentType: 'private',
};

interface Props {
  visible: boolean;
  professionalId: string;
  onClose: () => void;
}

export function ProceduresModal({ visible, professionalId, onClose }: Props) {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function loadProcedures() {
    setLoading(true);
    getProcedures(professionalId)
      .then(setProcedures)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (visible) loadProcedures();
  }, [visible]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Procedure) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      durationMinutes: p.durationMinutes,
      price: p.price?.toString() ?? '',
      paymentType: p.paymentType,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert(t('proc.requiredTitle'), t('proc.requiredMsg'));
      return;
    }
    setSaving(true);
    try {
      const price = form.price ? parseFloat(form.price) : undefined;
      if (editingId) {
        await updateProcedure(editingId, {
          name: form.name.trim(),
          durationMinutes: form.durationMinutes,
          price,
          paymentType: form.paymentType,
        });
      } else {
        await createProcedure({
          professionalId,
          name: form.name.trim(),
          durationMinutes: form.durationMinutes,
          price,
          paymentType: form.paymentType,
          active: true,
        });
      }
      setShowForm(false);
      loadProcedures();
    } catch {
      Alert.alert(t('proc.errorTitle'), t('proc.errorMsg'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(p: Procedure) {
    Alert.alert(
      t('proc.deleteTitle'),
      t('proc.deleteMsg', { name: p.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: () => deleteProcedure(p.id).then(loadProcedures).catch(() => {}),
        },
      ],
    );
  }

  async function toggleActive(p: Procedure) {
    await updateProcedure(p.id, { active: !p.active }).catch(() => {});
    loadProcedures();
  }

  const active = procedures.filter(p => p.active);
  const inactive = procedures.filter(p => !p.active);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('proc.title')}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t('common.add')}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.intro}>{t('proc.intro')}</Text>

            {procedures.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="list-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>{t('proc.emptyTitle')}</Text>
                <Text style={styles.emptyText}>{t('proc.emptyText')}</Text>
              </View>
            ) : (
              <>
                {active.length > 0 && (
                  <View style={styles.listCard}>
                    {active.map((p, i) => (
                      <ProcedureRow
                        key={p.id}
                        procedure={p}
                        border={i < active.length - 1}
                        onEdit={openEdit}
                        onDelete={confirmDelete}
                        onToggle={toggleActive}
                      />
                    ))}
                  </View>
                )}

                {inactive.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>{t('proc.inactive')}</Text>
                    <View style={styles.listCard}>
                      {inactive.map((p, i) => (
                        <ProcedureRow
                          key={p.id}
                          procedure={p}
                          border={i < inactive.length - 1}
                          onEdit={openEdit}
                          onDelete={confirmDelete}
                          onToggle={toggleActive}
                        />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Add / Edit form */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.formOverlay}>
          <View style={styles.formSheet}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingId ? t('proc.formTitle.edit') : t('proc.formTitle.new')}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>{t('proc.labelName')}</Text>
              <TextInput
                style={styles.formInput}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder={t('proc.namePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />

              <Text style={[styles.formLabel, { marginTop: 14 }]}>{t('proc.labelDuration')}</Text>
              <View style={styles.durationPills}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setForm(f => ({ ...f, durationMinutes: d }))}
                    style={[styles.pill, form.durationMinutes === d && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, form.durationMinutes === d && styles.pillTextActive]}>
                      {d} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.formLabel, { marginTop: 14 }]}>{t('proc.labelPrice')}</Text>
              <TextInput
                style={styles.formInput}
                value={form.price}
                onChangeText={v => setForm(f => ({ ...f, price: v }))}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.formLabel, { marginTop: 14 }]}>{t('proc.labelPaymentType')}</Text>
              <View style={styles.toggle}>
                <TouchableOpacity
                  style={[styles.toggleOpt, form.paymentType === 'private' && styles.toggleActive]}
                  onPress={() => setForm(f => ({ ...f, paymentType: 'private' }))}
                >
                  <Text style={[styles.toggleText, form.paymentType === 'private' && styles.toggleTextActive]}>{t('proc.private')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleOpt, form.paymentType === 'insurance' && styles.toggleActive]}
                  onPress={() => setForm(f => ({ ...f, paymentType: 'insurance' }))}
                >
                  <Text style={[styles.toggleText, form.paymentType === 'insurance' && styles.toggleTextActive]}>{t('proc.insurance')}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>{editingId ? t('common.update') : t('proc.create')}</Text>
                }
              </TouchableOpacity>

              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function ProcedureRow({ procedure: p, border, onEdit, onDelete, onToggle }: {
  procedure: Procedure;
  border: boolean;
  onEdit: (p: Procedure) => void;
  onDelete: (p: Procedure) => void;
  onToggle: (p: Procedure) => void;
}) {
  return (
    <View style={[styles.row, border && styles.rowBorder, !p.active && styles.rowInactive]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, !p.active && { color: Colors.textMuted }]}>{p.name}</Text>
        <Text style={styles.rowMeta}>
          {p.durationMinutes} min
          {p.price != null ? ` · R$ ${p.price.toFixed(2)}` : ''}
          {' · '}{p.paymentType === 'private' ? t('proc.private') : t('proc.insurance')}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity onPress={() => onToggle(p)} style={styles.rowBtn}>
          <Ionicons
            name={p.active ? 'eye-outline' : 'eye-off-outline'}
            size={16}
            color={p.active ? Colors.primary : Colors.textMuted}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(p)} style={styles.rowBtn}>
          <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(p)} style={styles.rowBtn}>
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  intro: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginHorizontal: 16, marginTop: 16, marginBottom: 12 },

  sectionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginHorizontal: 16, marginTop: 16, marginBottom: 6 },

  listCard: { marginHorizontal: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowInactive: { opacity: 0.5 },
  rowName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 3 },
  rowMeta: { fontSize: 12, color: Colors.textSecondary },
  rowActions: { flexDirection: 'row', gap: 4 },
  rowBtn: { padding: 6 },

  emptyState: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },

  // Form sheet
  formOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  formTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  formInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.background },
  durationPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: '#fff' },
  toggle: { flexDirection: 'row', gap: 8 },
  toggleOpt: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  toggleTextActive: { color: '#fff' },
  saveBtn: { marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
