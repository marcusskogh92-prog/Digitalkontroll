/**
 * Konstruktion Section – utforskare för Konstruktion och beräkningar.
 * Visar SharePoint-filer i mappen 04 - Konstruktion och beräkningar.
 */

import { StyleSheet, View } from 'react-native';
import KonstruktionRootFileListView from './items/KonstruktionRootFileListView';

export default function KonstruktionSection({
  companyId,
  project,
  activeItem,
  navigation,
  afRelativePath = '',
  setAfRelativePath = null,
  afSelectedItemId = null,
  setAfSelectedItemId = null,
  bumpAfMirrorRefreshNonce = null,
  hiddenCustomFolderNames = [],
}) {
  return (
    <View style={styles.container}>
      <KonstruktionRootFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        konstruktionRelativePath={afRelativePath}
        setKonstruktionRelativePath={setAfRelativePath}
        konstruktionSelectedItemId={afSelectedItemId}
        setKonstruktionSelectedItemId={setAfSelectedItemId}
        bumpKonstruktionMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
