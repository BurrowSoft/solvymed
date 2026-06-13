import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, FlatList, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useFocusEffect, router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Clinic } from '@/lib/types';
import { searchClinics } from '@/lib/discovery-service';
import { useStyles } from '@/lib/use-styles';
import { useAuth } from '@/lib/auth-context';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/role-context';

function buildMapHtml(clinics: Clinic[]): string {
  const markers = clinics
    .filter(c => c.lat != null && c.lng != null)
    .map(c => `L.marker([${c.lat}, ${c.lng}]).addTo(map).bindPopup(${JSON.stringify(c.name)});`)
    .join('\n');

  const center = clinics.find(c => c.lat != null)
    ? `[${clinics.find(c => c.lat != null)!.lat}, ${clinics.find(c => c.lat != null)!.lng}]`
    : '[-15.7801, -47.9292]'; // Brazil centre

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map').setView(${center}, 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
${markers}
</script></body></html>`;
}

type RecentDoctor = { professionalId: string; professionalName: string; clinicId: string; clinicName: string; specialty?: string };

export default function DiscoverScreen() {
  const styles = useStyles(makeStyles);
  const { height } = useWindowDimensions();
  const { user } = useAuth();
  const { role } = useRole();
  const [query, setQuery] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [recentDoctors, setRecentDoctors] = useState<RecentDoctor[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const results = await searchClinics(q);
      setClinics(results);
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentDoctors = useCallback(async () => {
    if (!user || role === 'professional') return;
    try {
      const { data } = await supabase
        .from('appointments')
        .select('professional_id, consultation_type')
        .eq('patient_auth_id', user.id)
        .not('status', 'in', '("cancelled","rejected")')
        .order('date', { ascending: false })
        .limit(20);
      if (!data?.length) return;

      const allClinics = await searchClinics('');
      const seen = new Set<string>();
      const recent: RecentDoctor[] = [];
      for (const row of data) {
        const pid = row.professional_id as string;
        if (seen.has(pid)) continue;
        seen.add(pid);
        for (const clinic of allClinics) {
          const prof = clinic.professionals?.find((p: { id: string }) => p.id === pid);
          if (prof) {
            recent.push({
              professionalId: pid,
              professionalName: (prof as { id: string; name: string; specialty?: string }).name,
              specialty: (prof as { id: string; name: string; specialty?: string }).specialty,
              clinicId: clinic.id,
              clinicName: clinic.name,
            });
            break;
          }
        }
        if (recent.length === 5) break;
      }
      setRecentDoctors(recent);
    } catch {}
  }, [user, role]);

  useFocusEffect(useCallback(() => { load(); loadRecentDoctors(); }, [load, loadRecentDoctors]));

  function handleSearch(text: string) {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(text), 400);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('discover.title')}</Text>
        <TouchableOpacity
          style={[styles.mapToggle, showMap && styles.mapToggleActive]}
          onPress={() => setShowMap(v => !v)}
        >
          <Ionicons name={showMap ? 'list-outline' : 'map-outline'} size={20} color={showMap ? '#fff' : Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder={t('discover.subtitle')}
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); load(''); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Recent Doctors */}
      {recentDoctors.length > 0 && role !== 'professional' && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>{t('discover.recentDoctors')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentList}>
            {recentDoctors.map(doc => (
              <TouchableOpacity
                key={doc.professionalId}
                style={styles.recentCard}
                onPress={() => router.push({ pathname: '/(tabs)/discover/book', params: { professionalId: doc.professionalId, clinicId: doc.clinicId } })}
              >
                <View style={styles.recentAvatar}>
                  <Ionicons name="person-outline" size={22} color={Colors.primary} />
                </View>
                <Text style={styles.recentName} numberOfLines={1}>{doc.professionalName}</Text>
                {doc.specialty && <Text style={styles.recentSpecialty} numberOfLines={1}>{doc.specialty}</Text>}
                <Text style={styles.recentClinic} numberOfLines={1}>{doc.clinicName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Map view */}
      {showMap && (
        <View style={[styles.mapContainer, { height: height * 0.4 }]}>
          <WebView
            source={{ html: buildMapHtml(clinics) }}
            style={styles.map}
            originWhitelist={['*']}
            javaScriptEnabled
          />
        </View>
      )}

      {/* Clinic list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={clinics}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No clinics found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          }
          renderItem={({ item: clinic }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/(tabs)/discover/[clinicId]', params: { clinicId: clinic.id } })}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="business-outline" size={22} color={Colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{clinic.name}</Text>
                {(clinic.city || clinic.address) && (
                  <Text style={styles.cardSub}>
                    <Ionicons name="location-outline" size={12} color={Colors.textMuted} />{' '}
                    {[clinic.address, clinic.city].filter(Boolean).join(', ')}
                  </Text>
                )}
                {clinic.phone && (
                  <Text style={styles.cardSub}>
                    <Ionicons name="call-outline" size={12} color={Colors.textMuted} />{' '}
                    {clinic.phone}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
    },
    title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
    mapToggle: {
      width: 38, height: 38, borderRadius: 10,
      borderWidth: 1.5, borderColor: Colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    mapToggleActive: { backgroundColor: Colors.primary },
    searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: Colors.surface, borderRadius: 12,
      borderWidth: 1, borderColor: Colors.border,
      paddingHorizontal: 14, height: 44,
    },
    searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
    mapContainer: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
    map: { flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: Colors.surface, borderRadius: 14,
      padding: 14, borderWidth: 1, borderColor: Colors.border,
    },
    cardIcon: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: `${Colors.primary}15`,
      alignItems: 'center', justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: 3 },
    cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSub: { fontSize: 12, color: Colors.textMuted },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
    emptySubtext: { fontSize: 13, color: Colors.textMuted },
    recentSection: { paddingBottom: 8 },
    recentTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, paddingHorizontal: 20, marginBottom: 8 },
    recentList: { paddingHorizontal: 16, gap: 10 },
    recentCard: {
      width: 120, padding: 12, borderRadius: 14,
      backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
      alignItems: 'center', gap: 4,
    },
    recentAvatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: `${Colors.primary}15`,
      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    recentName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    recentSpecialty: { fontSize: 11, color: Colors.primary, textAlign: 'center' },
    recentClinic: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  });
}
