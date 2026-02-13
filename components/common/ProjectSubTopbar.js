/**
 * ProjectSubTopbar - Dynamic sub-navigation (section's items)
 *
 * Shown only when the active section has items. Lighter than main topbar:
 * smaller text, less padding, thin underline for active item.
 */

import { useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';

const SUB = {
  text: '#64748b',
  textActive: '#334155',
  underline: '#334155',
  hoverBg: 'rgba(15, 23, 42, 0.04)',
  borderBottom: '#f1f5f9',
};

export default function ProjectSubTopbar({ subMenuItems, activeItem, onSelectItem }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [fadeAnim] = useState(() => new Animated.Value(1));

  if (!Array.isArray(subMenuItems) || subMenuItems.length === 0) {
    return null;
  }

  const isWeb = Platform.OS === 'web';

  return (
    <Animated.View style={[styles.wrapper, isWeb && styles.wrapperSticky, { opacity: fadeAnim }]}>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {subMenuItems.map((item, idx) => {
            const itemId = item?.id ?? `item-${idx}`;
            const isActive = activeItem === itemId;
            const isHovered = hoveredId === itemId;

            return (
              <Pressable
                key={itemId}
                style={[
                  styles.navItem,
                  isActive && styles.navItemActive,
                  isHovered && !isActive && styles.navItemHover,
                ]}
                onPress={() => onSelectItem?.(itemId)}
                onHoverIn={isWeb ? () => setHoveredId(itemId) : undefined}
                onHoverOut={isWeb ? () => setHoveredId(null) : undefined}
              >
                <Text
                  style={[styles.label, isActive && styles.labelActive]}
                  numberOfLines={1}
                >
                  {stripNumberPrefixForDisplay(item?.name ?? '')}
                </Text>
                {isActive && <View style={styles.underline} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fafbfc',
    borderBottomWidth: 1,
    borderBottomColor: SUB.borderBottom,
  },
  wrapperSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 99,
  },
  container: {
    minHeight: 36,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
  },
  navItem: {
    position: 'relative',
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 36,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  navItemActive: {},
  navItemHover: {
    backgroundColor: SUB.hoverBg,
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: SUB.text,
  },
  labelActive: {
    color: SUB.textActive,
    fontWeight: '500',
  },
  underline: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: 1.5,
    backgroundColor: SUB.underline,
    borderRadius: 1,
  },
});
