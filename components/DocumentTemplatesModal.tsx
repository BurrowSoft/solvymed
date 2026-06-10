import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Professional, DocumentType, DocumentTemplate } from '@/lib/types';
import { getAllTemplates } from '@/lib/template-service';
import { TemplateEditor } from './TemplateEditor';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface DocTypeInfo {
  key: DocumentType;
  label: string;
  description: string;
  icon: IoniconName;
}

const DOC_TYPES: DocTypeInfo[] = [
  {
    key: 'prescription',
    label: 'Prescription',
    description: 'Medication prescriptions for patients',
    icon: 'medical-outline',
  },
  {
    key: 'medical_record',
    label: 'Medical Record',
    description: 'Clinical notes and consultation records',
    icon: 'document-text-outline',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    description: 'Payment receipts and billing documents',
    icon: 'receipt-outline',
  },
];

interface Props {
  visible: boolean;
  professional: Professional | null;
  onClose: () => void;
}

export function DocumentTemplatesModal({ visible, professional, onClose }: Props) {
  const [templates, setTemplates] = useState<Partial<Record<DocumentType, DocumentTemplate>>>({});
  const [loading, setLoading] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);

  function loadTemplates() {
    if (!professional) return;
    setLoading(true);
    getAllTemplates(professional.id)
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (visible) loadTemplates();
  }, [visible, professional?.id]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Document Templates</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Customize the color palette and logo for each document type independently.
            Changes apply to all future exported PDFs.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
          ) : (
            <View style={styles.list}>
              {DOC_TYPES.map((dt, i) => {
                const tpl = templates[dt.key];
                const primaryColor = tpl?.primaryColor ?? Colors.primary;
                const logoUrl = tpl?.logoUrl;
                const configured = !!tpl;

                return (
                  <TouchableOpacity
                    key={dt.key}
                    style={[styles.row, i < DOC_TYPES.length - 1 && styles.rowBorder]}
                    onPress={() => setEditingType(dt.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: `${primaryColor}18` }]}>
                      <Ionicons name={dt.icon} size={20} color={primaryColor} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{dt.label}</Text>
                      <Text style={styles.rowDesc}>{dt.description}</Text>
                    </View>

                    <View style={styles.rowRight}>
                      {configured ? (
                        <View style={styles.previewDot}>
                          <View style={[styles.colorDot, { backgroundColor: primaryColor }]} />
                          {logoUrl && (
                            <View style={[styles.logoThumb, { borderColor: primaryColor }]}>
                              <Ionicons name="image" size={10} color={primaryColor} />
                            </View>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.notConfigured}>Not set</Text>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* TemplateEditor opens above this modal */}
      {editingType !== null && (
        <TemplateEditor
          visible
          documentType={editingType}
          professional={professional}
          onClose={() => setEditingType(null)}
          onSaved={() => {
            setEditingType(null);
            loadTemplates();
          }}
        />
      )}
    </Modal>
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

  intro: {
    fontSize: 13, color: Colors.textSecondary, lineHeight: 19,
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
  },

  list: {
    marginHorizontal: 16, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  rowDesc: { fontSize: 12, color: Colors.textSecondary },

  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  logoThumb: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  notConfigured: { fontSize: 11, color: Colors.textMuted },

  noteCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: Colors.primaryLight, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
