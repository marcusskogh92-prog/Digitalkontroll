/**
 * Översikt Section - Overview section for kalkylskede
 */

import { StyleSheet, Text, View } from 'react-native';

// Import items
import DeadlinesView from './items/Deadlines/DeadlinesView';
import FlodesschemaView from './items/Flodesschema/FlodesschemaView';
import ProjektstatusView from './items/Projektstatus/ProjektstatusView';
import RiskerView from './items/Risker/RiskerView';
import OversiktSummary from './OversiktSummary';

// New "Översikt 01–04" views (SharePoint filmappar)
import FragaSvarView from './items/FragaSvar/FragaSvarView';
import OrganisationRollerView from './items/OrganisationRoller/OrganisationRollerView';
import ProjektinformationView from './items/Projektinformation/ProjektinformationView';
import TidsplanViktigaDatumView from './items/TidsplanViktigaDatum/TidsplanViktigaDatumView';

const ITEM_COMPONENTS = {
  // SharePoint filmappar (01–04)
  projektinfo: ProjektinformationView,
  'organisation-roller': OrganisationRollerView,
  'tidsplan-viktiga-datum': TidsplanViktigaDatumView,
  'status-beslut': FragaSvarView,

  // Existing oversikt items
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
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40
  }
});
