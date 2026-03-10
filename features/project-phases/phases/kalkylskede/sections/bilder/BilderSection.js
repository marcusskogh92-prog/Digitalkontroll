/**
 * Bilder Section – samma logik som Förfrågningsunderlag.
 * Utforskarmiljö med flikar/mappar, Skapa-knapp, inga hårdkodade undermappar.
 */

import { StyleSheet, View } from 'react-native';
import BilderFileListView from './items/BilderFileListView';

export default function BilderSection({
  companyId,
  project,
  activeItem,
  activeNode,
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
      <BilderFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        bilderRelativePath={afRelativePath}
        setBilderRelativePath={setAfRelativePath}
        bilderSelectedItemId={afSelectedItemId}
        setBilderSelectedItemId={setAfSelectedItemId}
        bumpBilderMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
