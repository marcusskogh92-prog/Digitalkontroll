/**
 * FrågaSvar Section – huvudflik för frågor och svar (tidigare under Översikt).
 */

import { StyleSheet, View } from 'react-native';
import FragaSvarView from '../oversikt/items/FragaSvar/FragaSvarView';

export default function FragaSvarSection({ projectId, companyId, project, hidePageHeader = false }) {
  return (
    <View style={styles.container}>
      <FragaSvarView
        projectId={projectId}
        companyId={companyId}
        project={project}
        hidePageHeader={hidePageHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
});
