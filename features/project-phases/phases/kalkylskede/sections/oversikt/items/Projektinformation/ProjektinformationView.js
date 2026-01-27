/**
 * ProjektinformationView
 * (Översikt 01) – shows the existing project info summary/edit UI.
 */

import { View } from 'react-native';
import OversiktSummary from '../../OversiktSummary';

export default function ProjektinformationView({ projectId, companyId, project }) {
  return (
    <View style={{ flex: 1 }}>
      <OversiktSummary projectId={projectId} companyId={companyId} project={project} />
    </View>
  );
}
