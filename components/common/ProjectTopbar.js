/**
 * ProjectTopbar - Modern SaaS primary navigation (sections)
 *
 * Horizontal nav bar: no button look, underline for active, sticky.
 * Premium enterprise style; same tone as system dark blue/slate.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';

const TOPBAR = {
  text: '#1e293b',
  textActive: '#0f172a',
  textMuted: '#64748b',
  underline: '#0f172a',
  activeBgTint: 'rgba(15, 23, 42, 0.05)',
  hoverBg: 'rgba(15, 23, 42, 0.04)',
  borderBottom: '#e2e8f0',
};

function calcSortKey(section) {
  const numOrder = Number(section?.order);
  if (Number.isFinite(numOrder) && numOrder > 0) return numOrder;
  return 10_000;
}

function sortSections(sections) {
  return [...(sections || [])].sort((a, b) => {
    const ak = calcSortKey(a);
    const bk = calcSortKey(b);
    if (ak !== bk) return ak - bk;
    const an = String(a?.name || '');
    const bn = String(b?.name || '');
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export default function ProjectTopbar({ sections: sectionsProp, activeSection, onSelectSection }) {
  const [hoveredId, setHoveredId] = useState(null);
  const sections = sortSections(sectionsProp || []);

  if (sections.length === 0) return null;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.wrapper, isWeb && styles.wrapperSticky]}>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sections.map((section, idx) => {
            const sectionId = section?.id ?? `section-${idx}`;
            const isActive = activeSection === sectionId;
            const isHovered = hoveredId === sectionId;

            return (
              <Pressable
                key={sectionId}
                style={[
                  styles.navItem,
                  isActive && styles.navItemActive,
                  isHovered && !isActive && styles.navItemHover,
                ]}
                onPress={() => onSelectSection?.(sectionId)}
                onHoverIn={isWeb ? () => setHoveredId(sectionId) : undefined}
                onHoverOut={isWeb ? () => setHoveredId(null) : undefined}
              >
                <View style={styles.itemInner}>
                  <Ionicons
                    name={section.icon || 'folder-outline'}
                    size={18}
                    color={isActive ? TOPBAR.textActive : TOPBAR.textMuted}
                    style={styles.icon}
                  />
                  <Text
                    style={[
                      styles.label,
                      isActive && styles.labelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {stripNumberPrefixForDisplay(section?.name ?? '')}
                  </Text>
                </View>
                {isActive && <View style={styles.underline} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: TOPBAR.borderBottom,
  },
  wrapperSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: {
    minHeight: 44,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  navItem: {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  navItemActive: {
    backgroundColor: TOPBAR.activeBgTint,
  },
  navItemHover: {
    backgroundColor: TOPBAR.hoverBg,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: TOPBAR.textMuted,
  },
  labelActive: {
    color: TOPBAR.textActive,
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: 2.5,
    backgroundColor: TOPBAR.underline,
    borderRadius: 1,
  },
});
