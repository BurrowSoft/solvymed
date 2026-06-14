import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';
import { t } from '@/lib/i18n';

interface Props { visible: boolean; onClose: () => void; }

interface FaqItem { q: string; a: string; }

function getFaq(): FaqItem[] {
  return [
    {
      q: t('help.faq.addAppt.q'),
      a: t('help.faq.addAppt.a'),
    },
    {
      q: t('help.faq.blockTime.q'),
      a: t('help.faq.blockTime.a'),
    },
    {
      q: t('help.faq.whatsapp.q'),
      a: t('help.faq.whatsapp.a'),
    },
    {
      q: t('help.faq.export.q'),
      a: t('help.faq.export.a'),
    },
    {
      q: t('help.faq.theme.q'),
      a: t('help.faq.theme.a'),
    },
    {
      q: t('help.faq.workingHours.q'),
      a: t('help.faq.workingHours.a'),
    },
    {
      q: t('help.faq.recurring.q'),
      a: t('help.faq.recurring.a'),
    },
    {
      q: t('help.faq.patientName.q'),
      a: t('help.faq.patientName.a'),
    },
  ];
}

export function HelpModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const [expanded, setExpanded] = useState<number | null>(null);
  const faq = getFaq();

  function toggle(i: number) {
    setExpanded(prev => (prev === i ? null : i));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.help')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.intro}>{t('help.intro')}</Text>

          <View style={styles.card}>
            {faq.map((item, i) => (
              <View key={i} style={[styles.faqItem, i > 0 && styles.faqBorder]}>
                <TouchableOpacity style={styles.faqHeader} onPress={() => toggle(i)} activeOpacity={0.7}>
                  <Text style={styles.faqQ}>{item.q}</Text>
                  <Ionicons
                    name={expanded === i ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
                {expanded === i && (
                  <Text style={styles.faqA}>{item.a}</Text>
                )}
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => {
              Linking.openURL('mailto:support@solvymed.com?subject=SolvyMed%20Help').catch(() => {});
              onClose();
            }}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.primary} />
            <Text style={styles.supportBtnText}>{t('help.contactSupport')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  intro: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  card: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  faqItem: { paddingHorizontal: 14, paddingVertical: 12 },
  faqBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  faqA: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginTop: 8 },

  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 12, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  supportBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
