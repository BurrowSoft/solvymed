import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Colors } from '@/constants/Colors';
import { Clinic, ClinicProfessional } from '@/lib/types';
import { getClinic, getClinicProfessionals } from '@/lib/discovery-service';
import { useRole } from '@/lib/role-context';
import { useStyles } from '@/lib/use-styles';

export default function ClinicDetailScreen() {
  const styles = useStyles(makeStyles);
  const { clinicId } = useLocalSearchParams<{ clinicId: string }>();
  const { invitedByProfessionalId } = useRole();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [professionals, setProfessionals] = useState<ClinicProfessional[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [c, profs] = await Promise.all([
        getClinic(clinicId),
        getClinicProfessionals(clinicId),
      ]);
      setClinic(c);
      // Highlighted professional (invited by) first
      const sorted = [...profs].sort((a, b) => {
        if (a.professionalId === invitedByProfessionalId) return -1;
        if (b.professionalId === invitedByProfessionalId) return 1;
        return 0;
      });
      setProfessionals(sorted);
    } catch {}
    setLoading(false);
  }, [clinicId, invitedByProfessionalId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{clinic?.name ?? 'Clinic'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Clinic info */}
        <View style={styles.clinicCard}>
          <View style={styles.clinicIcon}>
            <Ionicons name="business" size={28} color={Colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.clinicName}>{clinic?.name}</Text>
            {(clinic?.address || clinic?.city) && (
              <Text style={styles.clinicInfo}>
                {[clinic?.address, clinic?.city, clinic?.state].filter(Boolean).join(', ')}
              </Text>
            )}
            {clinic?.phone && (
              <Text style={styles.clinicInfo}>{clinic.phone}</Text>
            )}
          </View>
        </View>

        {/* Doctors */}
        <Text style={styles.sectionTitle}>Doctors at this clinic</Text>

        {professionals.length === 0 ? (
          <Text style={styles.emptyText}>No doctors registered here yet.</Text>
        ) : (
          professionals.map(prof => {
            const isHighlighted = prof.professionalId === invitedByProfessionalId;
            return (
              <TouchableOpacity
                key={prof.professionalId}
                style={[styles.profCard, isHighlighted && styles.profCardHighlighted]}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/discover/book',
                    params: {
                      clinicId: clinicId!,
                      professionalId: prof.professionalId,
                      professionalName: prof.professionalName,
                      specialty: prof.specialty ?? '',
                    },
                  })
                }
              >
                {prof.photoUrl ? (
                  <Image source={{ uri: prof.photoUrl }} style={styles.profAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.profAvatarPlaceholder, isHighlighted && { backgroundColor: `${Colors.primary}30` }]}>
                    <Ionicons name="person" size={22} color={isHighlighted ? Colors.primary : Colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.profName, isHighlighted && styles.profNameHighlighted]}>
                      {prof.professionalName}
                    </Text>
                    {isHighlighted && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Invited you</Text>
                      </View>
                    )}
                  </View>
                  {prof.specialty && (
                    <Text style={styles.profSpec}>{prof.specialty}</Text>
                  )}
                </View>
                <Ionicons name="calendar-outline" size={20} color={isHighlighted ? Colors.primary : Colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles() {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    topBarTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center', marginHorizontal: 8 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, gap: 12 },
    clinicCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: Colors.surface, borderRadius: 16,
      padding: 16, borderWidth: 1, borderColor: Colors.border,
    },
    clinicIcon: {
      width: 52, height: 52, borderRadius: 14,
      backgroundColor: `${Colors.primary}15`,
      alignItems: 'center', justifyContent: 'center',
    },
    clinicName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
    clinicInfo: { fontSize: 13, color: Colors.textSecondary },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
    emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
    profCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: Colors.surface, borderRadius: 14,
      padding: 14, borderWidth: 1, borderColor: Colors.border,
    },
    profCardHighlighted: {
      borderColor: Colors.primary,
      backgroundColor: `${Colors.primary}08`,
    },
    profAvatar: { width: 48, height: 48, borderRadius: 24 },
    profAvatarPlaceholder: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: Colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    profName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
    profNameHighlighted: { color: Colors.primary },
    profSpec: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    badge: {
      backgroundColor: Colors.primary, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  });
}
