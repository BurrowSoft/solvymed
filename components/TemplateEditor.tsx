import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/Colors';
import { Professional, DocumentType, DocumentTemplate } from '@/lib/types';
import { getTemplate, saveTemplate, uploadLogo } from '@/lib/template-service';

const PRIMARY_PRESETS = [
  '#208AEF', '#2563EB', '#7C3AED', '#9333EA',
  '#DB2777', '#DC2626', '#D97706', '#059669',
  '#16A34A', '#0891B2', '#475569', '#1A2138',
];

const ACCENT_PRESETS = [
  '#E8F4FE', '#DBEAFE', '#EDE9FE', '#F3E8FF',
  '#FCE7F3', '#FEE2E2', '#FEF3C7', '#D1FAE5',
  '#CCFBF1', '#E0F7FA', '#FFF7ED', '#F1F5F9',
];

const LABEL: Record<DocumentType, string> = {
  prescription: 'Prescription',
  medical_record: 'Medical Record',
  invoice: 'Invoice',
};

function isValidHex(v: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(v);
}

interface Props {
  visible: boolean;
  documentType: DocumentType;
  professional: Professional | null;
  onClose: () => void;
  onSaved: () => void;
}

function DocumentPreview({
  primaryColor, accentColor, logoUri, headerText, footerText,
}: {
  primaryColor: string; accentColor: string; logoUri: string | null;
  headerText: string; footerText: string;
}) {
  return (
    <View style={pv.card}>
      <View style={[pv.header, { borderBottomColor: primaryColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={[pv.docTitle, { color: primaryColor }]}>Prescription</Text>
          <Text style={pv.docSub} numberOfLines={1}>{headerText}</Text>
        </View>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={pv.logo} resizeMode="contain" />
        ) : (
          <View style={[pv.logoBox, { borderColor: primaryColor }]}>
            <Text style={[pv.logoBoxText, { color: primaryColor }]}>LOGO</Text>
          </View>
        )}
      </View>

      <View style={[pv.tHead, { backgroundColor: primaryColor }]}>
        <Text style={pv.tHeadText}>Medication</Text>
        <Text style={pv.tHeadText}>Dosage</Text>
        <Text style={pv.tHeadText}>Duration</Text>
      </View>
      <View style={pv.tRow}>
        <Text style={pv.tCell}>Amoxicillin 500mg</Text>
        <Text style={pv.tCell}>1 tab</Text>
        <Text style={pv.tCell}>7 days</Text>
      </View>
      <View style={[pv.tRow, { backgroundColor: accentColor }]}>
        <Text style={pv.tCell}>Ibuprofen 400mg</Text>
        <Text style={pv.tCell}>1 tab</Text>
        <Text style={pv.tCell}>5 days</Text>
      </View>

      <View style={pv.footer}>
        <Text style={pv.footerText} numberOfLines={1}>{footerText}</Text>
      </View>
    </View>
  );
}

export function TemplateEditor({ visible, documentType, professional, onClose, onSaved }: Props) {
  const [primaryColor, setPrimaryColor] = useState('#208AEF');
  const [accentColor, setAccentColor] = useState('#E8F4FE');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pendingLogoUri, setPendingLogoUri] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [customPrimary, setCustomPrimary] = useState('#208AEF');
  const [customAccent, setCustomAccent] = useState('#E8F4FE');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !professional) return;
    getTemplate(professional.id, documentType).then(t => {
      setPrimaryColor(t.primaryColor);
      setAccentColor(t.accentColor);
      setLogoUrl(t.logoUrl ?? null);
      setHeaderText(t.headerText ?? professional.clinicName ?? '');
      setFooterText(t.footerText ?? '');
      setCustomPrimary(t.primaryColor);
      setCustomAccent(t.accentColor);
      setPendingLogoUri(null);
    }).catch(() => {});
  }, [visible, documentType, professional?.id]);

  async function pickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (result.canceled || !professional) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    setPendingLogoUri(asset.uri);
    setUploadingLogo(true);
    try {
      const url = await uploadLogo(professional.id, documentType, asset.uri, mimeType);
      setLogoUrl(url);
      setPendingLogoUri(null);
    } catch {
      setPendingLogoUri(null);
      Alert.alert(
        'Upload failed',
        'Make sure the "document-logos" Storage bucket is created in your Supabase dashboard and set to public.',
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!professional) return;
    setSaving(true);
    try {
      await saveTemplate({
        professionalId: professional.id,
        documentType,
        primaryColor,
        accentColor,
        logoUrl: logoUrl ?? undefined,
        headerText: headerText.trim() || undefined,
        footerText: footerText.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save template. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const logoToShow = pendingLogoUri ?? logoUrl;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{LABEL[documentType]} Template</Text>
          <TouchableOpacity
            style={[styles.saveBtn, (saving || uploadingLogo) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || uploadingLogo}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clinic Logo</Text>
            <View style={styles.logoRow}>
              <TouchableOpacity
                style={styles.logoBox}
                onPress={pickLogo}
                disabled={uploadingLogo}
                activeOpacity={0.75}
              >
                {logoToShow ? (
                  <Image source={{ uri: logoToShow }} style={styles.logoImage} resizeMode="contain" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="image-outline" size={26} color={Colors.textMuted} />
                    <Text style={styles.logoPlaceholderText}>Tap to upload logo</Text>
                  </View>
                )}
                {uploadingLogo && (
                  <View style={styles.logoOverlay}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
              {logoToShow && !uploadingLogo && (
                <TouchableOpacity
                  style={styles.removeLogoBtn}
                  onPress={() => { setLogoUrl(null); setPendingLogoUri(null); }}
                >
                  <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                  <Text style={styles.removeLogoText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>Recommended: 400×133 px, PNG with transparency.</Text>
          </View>

          {/* Primary color */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Primary Color</Text>
            <View style={styles.swatchGrid}>
              {PRIMARY_PRESETS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.swatch, { backgroundColor: c }, primaryColor === c && styles.swatchSelected]}
                  onPress={() => { setPrimaryColor(c); setCustomPrimary(c); }}
                  activeOpacity={0.8}
                >
                  {primaryColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.hexRow}>
              <View style={[styles.hexDot, { backgroundColor: isValidHex(customPrimary) ? customPrimary : primaryColor }]} />
              <TextInput
                style={styles.hexInput}
                value={customPrimary}
                onChangeText={v => { setCustomPrimary(v); if (isValidHex(v)) setPrimaryColor(v); }}
                placeholder="#208AEF"
                placeholderTextColor={Colors.textMuted}
                maxLength={7}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Accent color */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accent Color</Text>
            <Text style={styles.hint}>Applied as alternating row background in tables.</Text>
            <View style={[styles.swatchGrid, { marginTop: 10 }]}>
              {ACCENT_PRESETS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.swatch, { backgroundColor: c, borderWidth: 1, borderColor: Colors.border }, accentColor === c && styles.swatchSelectedLight]}
                  onPress={() => { setAccentColor(c); setCustomAccent(c); }}
                  activeOpacity={0.8}
                >
                  {accentColor === c && <Ionicons name="checkmark" size={14} color={Colors.textSecondary} />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.hexRow}>
              <View style={[styles.hexDot, { backgroundColor: isValidHex(customAccent) ? customAccent : accentColor, borderWidth: 1, borderColor: Colors.border }]} />
              <TextInput
                style={styles.hexInput}
                value={customAccent}
                onChangeText={v => { setCustomAccent(v); if (isValidHex(v)) setAccentColor(v); }}
                placeholder="#E8F4FE"
                placeholderTextColor={Colors.textMuted}
                maxLength={7}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Text fields */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Header & Footer Text</Text>
            <Text style={styles.fieldLabel}>Header</Text>
            <TextInput
              style={styles.textField}
              value={headerText}
              onChangeText={setHeaderText}
              placeholder="e.g. Dr. Name · Clinic · CRM 12345"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Footer</Text>
            <TextInput
              style={styles.textField}
              value={footerText}
              onChangeText={setFooterText}
              placeholder="e.g. CRM 12345 · São Paulo · (11) 99999-9999"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Live preview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live Preview</Text>
            <DocumentPreview
              primaryColor={primaryColor}
              accentColor={accentColor}
              logoUri={logoToShow}
              headerText={headerText || 'Clinic Name · City'}
              footerText={footerText || 'SolvyMed — Clinic Management'}
            />
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </SafeAreaView>
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
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  section: { margin: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  logoBox: {
    flex: 1, height: 80, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.background, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
  logoPlaceholder: { alignItems: 'center', gap: 4 },
  logoPlaceholderText: { fontSize: 12, color: Colors.textMuted },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeLogoBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  removeLogoText: { fontSize: 11, color: Colors.danger },

  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  swatchSelectedLight: { borderWidth: 2, borderColor: Colors.primary },

  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  hexDot: { width: 28, height: 28, borderRadius: 14 },
  hexInput: {
    flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },

  textField: {
    height: 42, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
});

const pv = StyleSheet.create({
  card: {
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 3,
  },
  docTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  docSub: { fontSize: 11, color: '#6B7A99' },
  logo: { width: 72, height: 28 },
  logoBox: { width: 60, height: 28, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  logoBoxText: { fontSize: 9, fontWeight: '700' },
  tHead: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6 },
  tHeadText: { flex: 1, fontSize: 10, color: '#fff', fontWeight: '600', textTransform: 'uppercase' },
  tRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E9F0' },
  tCell: { flex: 1, fontSize: 12, color: '#1A2138' },
  footer: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E5E9F0', marginTop: 4 },
  footerText: { fontSize: 10, color: '#A0ABBE', textAlign: 'center' },
});
