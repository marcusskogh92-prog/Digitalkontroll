/**
 * Möten Section
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MotenSection({ projectId, companyId, project, activeItem, navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholderText}>
        Möten kommer att implementeras här
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center'
  }
});
