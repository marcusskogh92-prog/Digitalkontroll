/**
 * Översikt Section - Overview section for kalkylskede
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Import items
import DeadlinesView from './items/Deadlines/DeadlinesView';
import FlodesschemaView from './items/Flodesschema/FlodesschemaView';
import ProjektstatusView from './items/Projektstatus/ProjektstatusView';
import RiskerView from './items/Risker/RiskerView';
import OversiktSummary from './OversiktSummary';

const ITEM_COMPONENTS = {
  projektstatus: ProjektstatusView,
  flodesschema: FlodesschemaView,
  deadlines: DeadlinesView,
  risker: RiskerView
};

export default function OversiktSection({ projectId, companyId, project, activeItem, navigation }) {
  // If no activeItem is selected, show summary view
  if (!activeItem) {
    return (
      <View style={styles.container}>
        <OversiktSummary
          projectId={projectId}
          companyId={companyId}
          project={project}
        />
      </View>
    );
  }

  const ItemComponent = ITEM_COMPONENTS[activeItem];

  if (!ItemComponent) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Komponent för "{activeItem}" hittades inte</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ItemComponent
        projectId={projectId}
        companyId={companyId}
        project={project}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40
  }
});
