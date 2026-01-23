/**
 * ProjectInternalNavigation - Internal navigation tabs for project view
 * Shows sections like Overview, Kalkyl, UE & Offerter, Documents, etc.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  if (Platform.OS === 'web') {
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
              <div
                key={section.id}
                onClick={() => onSelectSection?.(section.id)}
                style={{
                  ...styles.navButton,
                  ...(isActive ? styles.navButtonActive : {}),
                  cursor: 'pointer',
                }}
              >
                <Ionicons
                  name={section.icon}
                  size={18}
                  color={isActive ? '#1976D2' : '#666'}
                  style={{ marginRight: 6 }}
                />
                <span style={{
                  fontSize: 14,
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? '#1976D2' : '#444',
                }}>
                  {section.name}
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
                color={isActive ? '#1976D2' : '#666'}
                style={{ marginRight: 6 }}
              />
              <Text style={[
                styles.navButtonText,
                isActive && styles.navButtonTextActive,
              ]}>
                {section.name}
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
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 120,
  },
  navButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
    borderWidth: 2,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#444',
  },
  navButtonTextActive: {
    fontWeight: '600',
    color: '#1976D2',
  },
});
