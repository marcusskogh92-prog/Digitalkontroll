/**
 * ProjectTopbar – Primary navigation (2026 SaaS).
 * Segmented text nav: no pills/buttons, underline active, sticky with scroll shadow + blur.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIMARY_TOPBAR } from '../../constants/topbarTheme';
import { useProjectScroll } from '../../contexts/ProjectScrollContext';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';

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

export default function ProjectTopbar({ sections: sectionsProp, activeSection, onSelectSection, onLayout, sectionLoadingIds = [] }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [barHovered, setBarHovered] = useState(false);
  const { scrollY = 0 } = useProjectScroll();
  const sections = sortSections(sectionsProp || []);
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;

    const onWheel = (e) => {
      const wrapper = document.getElementById('project-topbar-wheel');
      if (!wrapper || !e.target || !wrapper.contains(e.target)) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const r = scrollRef.current;
      const scrollNode = r?.getScrollableNode?.() ?? (typeof r?.scrollLeft !== 'undefined' ? r : null);
      if (!scrollNode || typeof scrollNode.scrollLeft === 'undefined') return;
      const maxLeft = scrollNode.scrollWidth - scrollNode.clientWidth;
      const canScrollRight = maxLeft > 0 && scrollNode.scrollLeft < maxLeft;
      const canScrollLeft = scrollNode.scrollLeft > 0;
      const wantRight = e.deltaY > 0;
      const willConsume = (wantRight && canScrollRight) || (!wantRight && canScrollLeft);
      if (willConsume) e.preventDefault();
      const next = Math.max(0, Math.min(maxLeft, scrollNode.scrollLeft + e.deltaY));
      scrollNode.scrollLeft = next;
    };

    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, [isWeb]);

  if (sections.length === 0) return null;

  const isScrolled = scrollY > 8;

  return (
    <View
      ref={wrapperRef}
      nativeID={isWeb ? 'project-topbar-wheel' : undefined}
      onLayout={onLayout}
      onMouseEnter={isWeb ? () => setBarHovered(true) : undefined}
      onMouseLeave={isWeb ? () => setBarHovered(false) : undefined}
      style={[
        styles.wrapper,
        isWeb && styles.wrapperSticky,
        isWeb && isScrolled && styles.wrapperScrolled,
        isWeb && barHovered && styles.wrapperHovered,
      ]}
    >
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sections.map((section, idx) => {
            const sectionId = section?.id ?? `section-${idx}`;
            const isActive = activeSection === sectionId;
            const isHovered = hoveredId === sectionId;
            const isLoading = Array.isArray(sectionLoadingIds) && sectionLoadingIds.includes(sectionId);

            const iconName = section.icon || 'folder-outline';
            const labelText = stripNumberPrefixForDisplay(section?.name ?? '');

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
                    name={iconName}
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
                    {labelText}
                  </Text>
                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={isActive ? (PRIMARY_TOPBAR.textActive || '#1e293b') : '#94a3b8'}
                      style={{ marginLeft: 6 }}
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
  wrapperHovered: {
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
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
