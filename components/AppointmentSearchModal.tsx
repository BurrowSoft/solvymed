import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Appointment } from '@/lib/types';
import { MOCK_APPOINTMENTS } from '@/lib/mock-data';
import { searchAppointments } from '@/lib/services';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';

function statusColor(status: Appointment['status']) {
  switch (status) {
    case 'confirmed': return Colors.primary;
    case 'completed': return Colors.success;
    case 'cancelled': return Colors.danger;
    case 'blocked': return Colors.blocked;
    default: return Colors.warning;
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AppointmentSearchModal({ visible, onClose }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setQuery('');
      setResults([]);
      setSelected(null);
    }
  }, [visible]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (user) {
          const data = await searchAppointments(user.id, query.trim());
          setResults(data);
        } else {
          const lower = query.toLowerCase();
          setResults(
            MOCK_APPOINTMENTS.filter(a =>
              a.status !== 'blocked' && a.patientName.toLowerCase().includes(lower)
            )
          );
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); };
  }, [query, user]);

  // ── Detail view (replaces list within the same modal) ──────────────────────
  if (selected) {
    const appt = selected;
    return (
      <Modal visible animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelected(null)}>
          <Pressable style={styles.detailCard} onPress={() => {}}>
            <View style={styles.detailHeader}>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.detailTitle} numberOfLines={1}>{appt.patientName}</Text>
              <TouchableOpacity onPress={() => { setSelected(null); onClose(); }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
              <Text style={styles.detailMeta}>{appt.date} · {appt.startTime} ({appt.durationMinutes} min)</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="medical-outline" size={15} color={Colors.textMuted} />
              <Text style={styles.detailMeta}>{appt.consultationType}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name={appt.type === 'online' ? 'videocam-outline' : 'business-outline'} size={15} color={Colors.textMuted} />
              <Text style={styles.detailMeta}>{appt.type === 'online' ? t('apptType.online') : t('apptType.inPerson')}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="card-outline" size={15} color={Colors.textMuted} />
              <Text style={styles.detailMeta}>
                {appt.paymentType === 'private' ? t('newAppt.private') : t('newAppt.insurance')}
                {appt.paymentAmount ? ` · R$ ${appt.paymentAmount.toFixed(2)}` : ''}
                {' · '}
                <Text style={{ color: appt.paymentStatus === 'paid' ? Colors.success : Colors.warning }}>
                  {appt.paymentStatus === 'paid' ? t('appt.paid') : t('payments.pending')}
                </Text>
              </Text>
            </View>
            {appt.notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>{t('appt.notes')}</Text>
                <Text style={styles.notesText}>{appt.notes}</Text>
              </View>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: statusColor(appt.status) + '20', alignSelf: 'flex-start' }]}>
              <Text style={[styles.statusText, { color: statusColor(appt.status) }]}>
                {t(`status.${appt.status}` as Parameters<typeof t>[0])}
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // ── Search view ────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder={t('search.placeholder')}
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {query.length === 0 && (
          <View style={styles.hint}>
            <Ionicons name="search-outline" size={44} color={Colors.textMuted} />
            <Text style={styles.hintText}>{t('search.hintTitle')}</Text>
            <Text style={styles.hintSub}>{t('search.hintSub')}</Text>
          </View>
        )}

        {query.length === 1 && (
          <Text style={styles.shortQuery}>{t('search.shortQuery')}</Text>
        )}

        {loading && query.length >= 2 && (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        )}

        {!loading && results.length === 0 && query.length >= 2 && (
          <View style={styles.hint}>
            <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
            <Text style={styles.hintText}>{t('search.noResultsTitle')}</Text>
            <Text style={styles.hintSub}>{t('search.noResultsSub')}</Text>
          </View>
        )}

        <FlatList
          data={results}
          keyExtractor={a => a.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 64 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultRow} onPress={() => setSelected(item)}>
              <View style={styles.resultAvatar}>
                <Text style={styles.resultInitial}>{item.patientName[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{item.patientName}</Text>
                <Text style={styles.resultMeta}>{item.date} · {item.startTime} · {item.consultationType}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                  {t(`status.${item.status}` as Parameters<typeof t>[0])}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingHorizontal: 10, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  hint: { alignItems: 'center', paddingVertical: 80, gap: 8 },
  hintText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  hintSub: { fontSize: 13, color: Colors.textMuted },
  shortQuery: { textAlign: 'center', marginTop: 40, fontSize: 13, color: Colors.textMuted },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: Colors.surface, gap: 12 },
  resultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  resultInitial: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  resultName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  resultMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Detail card
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  backBtn: { padding: 2 },
  detailTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailMeta: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  notesBox: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, gap: 4 },
  notesLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase' },
  notesText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
});
