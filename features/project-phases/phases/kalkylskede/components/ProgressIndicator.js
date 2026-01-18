/**
 * Progress Indicator Component
 * Shows progress bar with percentage
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProgressIndicator({ progress = 0, showLabel = true, size = 'medium' }) {
  const progressValue = Math.max(0, Math.min(100, progress));

  const height = size === 'small' ? 4 : size === 'large' ? 8 : 6;
  const fontSize = size === 'small' ? 10 : size === 'large' ? 14 : 12;

  return (
    <View style={styles.container}>
      <View style={[styles.progressBar, { height }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressValue}%`,
              height,
              backgroundColor: progressValue === 100 ? '#4CAF50' : progressValue >= 50 ? '#FF9800' : '#1976D2'
            }
          ]}
        />
      </View>
      {showLabel && (
        <Text style={[styles.progressText, { fontSize }]}>
          {progressValue}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  progressBar: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressFill: {
    borderRadius: 4,
    transition: 'width 0.3s ease'
  },
  progressText: {
    color: '#666',
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right'
  }
});
