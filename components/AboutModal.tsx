import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Colors } from '@/constants/Colors';
import { useStyles } from '@/lib/use-styles';

interface Props { visible: boolean; onClose: () => void; }

export function AboutModal({ visible, onClose }: Props) {
  const styles = useStyles(makeStyles);
  const version = Constants.expoConfig?.version ?? '—';
  const buildNumber = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '—';

  function link(url: string) { Linking.openURL(url).catch(() => {}); }
  function mailto() { Linking.openURL('mailto:support@solvymed.com').catch(() => {}); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>About SolvyMed</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoLetter}>S</Text>
            </View>
            <Text style={styles.appName}>SolvyMed</Text>
            <Text style={styles.tagline}>Intelligent clinic management</Text>
          </View>

          <View style={styles.card}>
            <Row label="Version" value={`v${version}`} />
            <Row label="Build" value={String(buildNumber)} border />
            <Row label="Platform" value="Android" border />
          </View>

          <View style={styles.card}>
            <Row label="Developer" value="BurrowSoft" />
            <Row
              label="Support"
              value="support@solvymed.com"
              onPress={mailto}
              border
            />
            <Row
              label="Website"
              value="solvymed.com"
              onPress={() => link('https://solvymed.com')}
              border
            />
          </View>

          <View style={styles.card}>
            <Row
              label="Privacy Policy"
              onPress={() => link('https://solvymed.com/privacy')}
              chevron
            />
            <Row
              label="Terms of Service"
              onPress={() => link('https://solvymed.com/terms')}
              chevron
              border
            />
          </View>

          <Text style={styles.copyright}>© 2025 BurrowSoft. All rights reserved.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({
  label, value, onPress, border, chevron,
}: {
  label: string; value?: string; onPress?: () => void; border?: boolean; chevron?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[styles.row, border && styles.rowBorder]} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, !!onPress && styles.rowLink]}>{value}</Text>
      ) : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
      ) : null}
    </Wrap>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '88%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },

  logoArea: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  logoLetter: { fontSize: 36, fontWeight: '900', color: '#fff' },
  appName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  tagline: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  card: {
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowLabel: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  rowValue: { fontSize: 14, color: Colors.textSecondary },
  rowLink: { color: Colors.primary },

  copyright: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
});
