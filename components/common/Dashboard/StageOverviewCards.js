/**
 * StageOverviewCards – 4 skede-boxar högst upp på startsidan.
 * Top notch 2026 SaaS: card style, subtila accenter, hover, klick filtrerar projektlistan.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const STAGES = [
  { key: 'kalkylskede', label: 'Kalkyl', icon: 'calculator-outline' },
  { key: 'produktion', label: 'Produktion', icon: 'construct-outline' },
  { key: 'eftermarknad', label: 'Eftermarknad', icon: 'time-outline' },
  { key: 'avslut', label: 'Avslutade', icon: 'checkmark-circle-outline' },
];

const ACCENT = {
  kalkylskede: { border: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)' },
  produktion: { border: '#22C55E', bg: 'rgba(34, 197, 94, 0.08)' },
  eftermarknad: { border: '#F97316', bg: 'rgba(249, 115, 22, 0.08)' },
  avslut: { border: '#64748B', bg: 'rgba(100, 116, 139, 0.08)' },
};

function countByStage(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const counts = { kalkylskede: 0, produktion: 0, eftermarknad: 0, avslut: 0 };
  for (const p of list) {
    const phase = String(p?.phase || 'kalkylskede').trim().toLowerCase();
    const key = phase === 'free' ? 'kalkylskede' : (counts.hasOwnProperty(phase) ? phase : 'kalkylskede');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export default function StageOverviewCards({
  projects = [],
  activeStageFilter = null,
  onStageFilter,
}) {
  const counts = useMemo(() => countByStage(projects), [projects]);
  const [hoveredKey, setHoveredKey] = useState(null);
  const { width } = useWindowDimensions();

  const gridCols = Platform.OS === 'web'
    ? (width >= 900 ? 4 : width >= 600 ? 2 : 1)
    : (width >= 768 ? 2 : 1);

  const handlePress = (key) => {
    if (typeof onStageFilter !== 'function') return;
    onStageFilter(activeStageFilter === key ? null : key);
  };

  return (
    <View style={[styles.wrapper, Platform.OS === 'web' && { gridTemplateColumns: `repeat(${gridCols}, 1fr)` }]}>
      {STAGES.map((stage) => {
        const count = counts[stage.key] ?? 0;
        const isActive = activeStageFilter === stage.key;
        const isHovered = hoveredKey === stage.key;
        const accent = ACCENT[stage.key] || ACCENT.avslut;

        return (
          <Pressable
            key={stage.key}
            onPress={() => handlePress(stage.key)}
            onHoverIn={Platform.OS === 'web' ? () => setHoveredKey(stage.key) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setHoveredKey(null) : undefined}
            style={({ pressed }) => [
              styles.card,
              isActive && { borderColor: accent.border, backgroundColor: accent.bg },
              Platform.OS === 'web' && styles.cardWeb,
              isHovered && Platform.OS === 'web' && styles.cardHover,
              pressed && styles.cardPressed,
            ]}
            accessibilityLabel={`${stage.label}, ${count} projekt. ${isActive ? 'Avmarkera filter' : 'Visa endast projekt i detta skede'}`}
            accessibilityRole="button"
            title={Platform.OS === 'web' ? 'Visa endast projekt i detta skede' : undefined}
          >
            <View style={[styles.accentBar, { backgroundColor: accent.border }]} />
            <View style={styles.content}>
              <View style={[styles.iconWrap, { backgroundColor: accent.bg }]}>
                <Ionicons name={stage.icon} size={22} color={accent.border} />
              </View>
              <View style={styles.textWrap}>
                <Text style={styles.title} numberOfLines={1}>{stage.label}</Text>
                <Text style={styles.count}>{count} projekt</Text>
                <Text style={styles.sub}>Aktiva projekt</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
    ...(Platform.OS === 'web' ? {
      display: 'grid',
      gap: 12,
    } : {}),
  },
  card: {
    flex: 1,
    minWidth: 140,
    maxWidth: Platform.OS === 'web' ? undefined : 280,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' ? {
      minHeight: 88,
      transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    } : {}),
  },
  cardWeb: {
    minWidth: 0,
  },
  cardHover: {
    transform: [{ translateY: -2 }],
    borderColor: '#94A3B8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.95,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  count: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 0,
  },
  sub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 0,
  },
});

export { countByStage, STAGES };
