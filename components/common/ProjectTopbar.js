/**
 * ProjectTopbar – Primary navigation (2026 SaaS).
 * Segmented text nav: no pills/buttons, underline active, sticky with scroll shadow + blur.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIMARY_TOPBAR } from '../../constants/topbarTheme';
import { useProjectScroll } from '../../contexts/ProjectScrollContext';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';

function calcSortKey(section) {
  const numOrder = Number(section?.order);
  if (Number.isFinite(numOrder) && numOrder > 0) return numOrder;
  return 10_000;
}

/** Sektioner markerade som klara under uppbyggnad – radera när alla är klara. */
const COMPLETED_SECTIONS_DEV = ['forfragningsunderlag', 'bilder', 'myndigheter', 'anbud'];

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

export default function ProjectTopbar({ sections: sectionsProp, activeSection, onSelectSection, onLayout }) {
  const [hoveredId, setHoveredId] = useState(null);
  const { scrollY = 0 } = useProjectScroll();
  const sections = sortSections(sectionsProp || []);

  if (sections.length === 0) return null;

  const isWeb = Platform.OS === 'web';
  const isScrolled = scrollY > 8;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.wrapper,
        isWeb && styles.wrapperSticky,
        isWeb && isScrolled && styles.wrapperScrolled,
      ]}
    >
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
                    color={isActive ? PRIMARY_TOPBAR.textActive : PRIMARY_TOPBAR.textInactive}
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
                  {COMPLETED_SECTIONS_DEV.includes(sectionId) ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#22c55e"
                      style={{ marginLeft: 6 }}
                      accessibilityLabel="Klart"
                    />
                  ) : null}
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
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    ...(Platform.OS === 'web' ? { transition: 'box-shadow 0.25s ease, background-color 0.25s ease' } : {}),
  },
  wrapperSticky: {
    position: 'sticky',
    top: 0,
    zIndex: PRIMARY_TOPBAR.stickyZIndex,
  },
  wrapperScrolled: {
    ...(Platform.OS === 'web'
      ? {
          boxShadow: PRIMARY_TOPBAR.scrollShadow,
          backgroundColor: PRIMARY_TOPBAR.scrollBg,
          backdropFilter: `blur(${PRIMARY_TOPBAR.scrollBlur}px)`,
          WebkitBackdropFilter: `blur(${PRIMARY_TOPBAR.scrollBlur}px)`,
        }
      : {}),
  },
  container: {
    minHeight: 52,
  },
  scrollContent: {
    paddingVertical: PRIMARY_TOPBAR.paddingVertical,
    paddingHorizontal: PRIMARY_TOPBAR.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: PRIMARY_TOPBAR.itemGap,
  },
  navItem: {
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s ease, color 0.2s ease' } : {}),
  },
  navItemHover: {
    backgroundColor: PRIMARY_TOPBAR.hoverBg,
    borderRadius: PRIMARY_TOPBAR.hoverBorderRadius,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PRIMARY_TOPBAR.iconTextGap,
  },
  icon: {
    marginRight: 0,
  },
  label: {
    fontSize: PRIMARY_TOPBAR.fontSize,
    fontWeight: PRIMARY_TOPBAR.fontWeight,
    color: PRIMARY_TOPBAR.textInactive,
    ...(Platform.OS === 'web' ? { letterSpacing: PRIMARY_TOPBAR.letterSpacing } : {}),
  },
  labelActive: {
    color: PRIMARY_TOPBAR.textActive,
  },
  underline: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: PRIMARY_TOPBAR.underlineHeight,
    backgroundColor: PRIMARY_TOPBAR.underlineColor,
    borderRadius: PRIMARY_TOPBAR.underlineBorderRadius,
    ...(Platform.OS === 'web' ? { transition: 'opacity 0.2s ease' } : {}),
  },
});
