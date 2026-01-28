/**
 * Phase Top Navigator - Top navigation bar with progress indicators
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProgressIndicator from './ProgressIndicator';

export default function PhaseTopNavigator({
  navigation,
  sectionProgress,
  activeSection,
  onSelectSection,
  projectName
}) {
  if (!navigation || !navigation.sections) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {navigation.sections.map(section => {
          const progress = sectionProgress[section.id] || { progress: 0 };
          const isActive = activeSection === section.id;
          const progressValue = progress.progress || 0;

          // Determine color based on progress
          let progressColor = '#1976D2'; // Blue (default)
          if (progressValue === 100) {
            progressColor = '#4CAF50'; // Green (complete)
          } else if (progressValue >= 50) {
            progressColor = '#FF9800'; // Orange (in progress)
          }

          return (
            <TouchableOpacity
              key={section.id}
              style={[styles.navButton, isActive && styles.navButtonActive]}
              onPress={() => {
                if (onSelectSection) {
                  onSelectSection(section.id);
                }
              }}
            >
              {/* Progress bar background */}
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${progressValue}%`,
                      backgroundColor: progressColor
                    }
                  ]}
                />
              </View>

              {/* Content */}
              <View style={styles.buttonContent}>
                <Ionicons
                  name={section.icon || 'folder-outline'}
                  size={18}
                  color={isActive ? '#1976D2' : '#666'}
                  style={styles.icon}
                />
                <Text style={[styles.buttonText, isActive && styles.buttonTextActive]}>
                  {section.name}
                </Text>
                <Text style={styles.progressText}>{progressValue}%</Text>
              </View>
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
    paddingVertical: 8
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 8
  },
  navButton: {
    position: 'relative',
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden'
  },
  navButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
    borderWidth: 2
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#e0e0e0'
  },
  progressBarFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  icon: {
    marginRight: 4
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    flex: 1
  },
  buttonTextActive: {
    color: '#1976D2'
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    minWidth: 35,
    textAlign: 'right'
  }
});
