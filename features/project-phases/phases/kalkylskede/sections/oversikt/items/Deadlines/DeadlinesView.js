/**
 * Deadlines View - Deadlines component
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';

export default function DeadlinesView({ projectId, companyId, project, hidePageHeader = false }) {
  return (
    <ScrollView style={styles.container}>
      {!hidePageHeader ? (
        <View style={styles.header}>
          <Text style={PROJECT_TYPOGRAPHY.viewTitle}>Deadlines</Text>
          <Text style={PROJECT_TYPOGRAPHY.viewSubtitle}>Hantera projektets deadlines och tidsplan</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        <Text style={styles.placeholderText}>
          Deadlines kommer att implementeras här
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
