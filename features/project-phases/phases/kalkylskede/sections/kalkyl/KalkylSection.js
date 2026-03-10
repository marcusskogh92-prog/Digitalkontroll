/**
 * Kalkyl Section – utforskare på sektionsrot + flikar (Kalkylritningar, Kalkylanteckningar, Kalkyl).
 * Samma logik som Anbud: flikar med utforskare, möjlighet att radera flikar.
 */

import { StyleSheet, View } from 'react-native';
import KalkylRootFileListView from './items/KalkylRootFileListView';

export default function KalkylSection({
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
      <KalkylRootFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        kalkylRelativePath={afRelativePath}
        setKalkylRelativePath={setAfRelativePath}
        kalkylSelectedItemId={afSelectedItemId}
        setKalkylSelectedItemId={setAfSelectedItemId}
        bumpKalkylMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
