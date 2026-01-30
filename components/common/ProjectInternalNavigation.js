/**
 * ProjectInternalNavigation - Internal navigation tabs for project view
 * Shows sections like Overview, Kalkyl, UE & Offerter, Documents, etc.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { LEFT_NAV } from '../../constants/leftNavTheme';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';

const NAVIGATION_SECTIONS = [
  { id: 'overview', name: 'Översikt', icon: 'list-outline', order: 1 },
  { id: 'kalkyl', name: 'Kalkyl', icon: 'calculator-outline', order: 2 },
  { id: 'ue-offerter', name: 'UE & Offerter', icon: 'document-text-outline', order: 3 },
  { id: 'documents', name: 'Dokument', icon: 'folder-outline', order: 4 },
  { id: 'controls', name: 'Kontroller', icon: 'checkbox-outline', order: 5 },
];

export default function ProjectInternalNavigation({
  activeSection,
  onSelectSection,
  project,
}) {
  const isWeb = Platform.OS === 'web';
  const [hoveredId, setHoveredId] = useState(null);

  if (isWeb) {
    return (
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {NAVIGATION_SECTIONS.map(section => {
            const isActive = activeSection === section.id;
            const isHovered = hoveredId === section.id;
            const textColor = isActive
              ? LEFT_NAV.accent
              : (isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault);
            const iconColor = isActive
              ? LEFT_NAV.accent
              : (isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconDefault);
            return (
              <div
                key={section.id}
                onClick={() => onSelectSection?.(section.id)}
                onMouseEnter={isWeb ? () => setHoveredId(section.id) : undefined}
                onMouseLeave={isWeb ? () => setHoveredId(null) : undefined}
                style={{
                  ...styles.navButtonWeb,
                  ...(isActive ? styles.navButtonWebActive : {}),
                  ...(isHovered && !isActive ? styles.navButtonWebHover : {}),
                  cursor: 'pointer',
                }}
              >
                <Ionicons
                  name={section.icon}
                  size={18}
                  color={iconColor}
                  style={{ marginRight: 6 }}
                />
                <span style={{
                  fontSize: 14,
                  fontWeight: isActive ? '600' : '400',
                  color: textColor,
                  fontFamily: LEFT_NAV.webFontFamily,
                }}>
                    {stripNumberPrefixForDisplay(section.name)}
                </span>
              </div>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {NAVIGATION_SECTIONS.map(section => {
          const isActive = activeSection === section.id;
          return (
            <TouchableOpacity
              key={section.id}
              onPress={() => onSelectSection?.(section.id)}
              style={[
                styles.navButton,
                isActive && styles.navButtonActive,
              ]}
            >
              <Ionicons
                name={section.icon}
                size={18}
                color={isActive ? LEFT_NAV.accent : LEFT_NAV.iconDefault}
                style={{ marginRight: 6 }}
              />
                <Text style={[
                styles.navButtonText,
                isActive && styles.navButtonTextActive,
              ]}>
                  {stripNumberPrefixForDisplay(section.name)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 120,
  },
  navButtonActive: {
    backgroundColor: LEFT_NAV.activeBg,
    borderColor: LEFT_NAV.activeBorder,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: LEFT_NAV.textDefault,
  },
  navButtonTextActive: {
    fontWeight: '600',
    color: LEFT_NAV.accent,
  },

  // Web-only uses inline styles; keep separate objects for spreading.
  navButtonWeb: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    userSelect: 'none',
    transition: 'background 0.15s, border 0.15s',
  },
  navButtonWebHover: {
    backgroundColor: LEFT_NAV.hoverBg,
    borderColor: LEFT_NAV.accent,
  },
  navButtonWebActive: {
    backgroundColor: LEFT_NAV.activeBg,
    borderColor: LEFT_NAV.activeBorder,
  },
});
