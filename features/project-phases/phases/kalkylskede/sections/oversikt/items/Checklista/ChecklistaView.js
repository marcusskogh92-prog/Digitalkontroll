/**
 * ChecklistaView – systemvy under Översikt (01 - Checklista).
 * Placeholder för checklista-funktionalitet.
 */

import { StyleSheet, Text, View } from 'react-native';

export default function ChecklistaView() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Checklista</Text>
      <Text style={styles.subtitle}>Systemfil. Innehåll kan läggas till här senare.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
});
