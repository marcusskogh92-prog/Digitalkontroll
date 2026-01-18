/**
 * Flödesschema View - Flowchart component
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function FlodesschemaView({ projectId, companyId, project }) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Flödesschema</Text>
        <Text style={styles.subtitle}>Översikt över projektets flöde och processer</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.placeholderText}>
          Flödesschema kommer att implementeras här
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center'
  }
});
