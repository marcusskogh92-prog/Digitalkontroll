/**
 * Myndigheter Section – samma logik som Bilder/Förfrågningsunderlag.
 * Utforskarmiljö med flikar/mappar, Skapa-knapp, inga hårdkodade undermappar.
 */

import { StyleSheet, View } from 'react-native';
import MyndigheterFileListView from './items/MyndigheterFileListView';

export default function MyndigheterSection({
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
      <MyndigheterFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        myndigheterRelativePath={afRelativePath}
        setMyndigheterRelativePath={setAfRelativePath}
        myndigheterSelectedItemId={afSelectedItemId}
        setMyndigheterSelectedItemId={setAfSelectedItemId}
        bumpMyndigheterMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
