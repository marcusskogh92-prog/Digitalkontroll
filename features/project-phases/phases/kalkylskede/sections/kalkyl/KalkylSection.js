/**
 * Kalkyl Section
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function KalkylSection({ projectId, companyId, project, activeItem, navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholderText}>
        Kalkyl kommer att implementeras här
      </Text>
      {activeItem && <Text style={styles.itemText}>Aktivt item: {activeItem}</Text>}
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
  },
  itemText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666'
  }
});
