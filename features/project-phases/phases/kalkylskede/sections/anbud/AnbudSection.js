/**
 * Anbud Section – utforskare på sektionsrot + flikar (Anbudsdokument, Kalkylsammanfattning, etc.).
 * När ingen flik är vald: visar utforskaren för Anbud-roten.
 * När en flik är vald: PhaseLayout visar utforskaren för den undermappen direkt.
 */

import { StyleSheet, View } from 'react-native';
import AnbudRootFileListView from './items/AnbudRootFileListView';

export default function AnbudSection({
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
      <AnbudRootFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        anbudRelativePath={afRelativePath}
        setAnbudRelativePath={setAfRelativePath}
        anbudSelectedItemId={afSelectedItemId}
        setAnbudSelectedItemId={setAfSelectedItemId}
        bumpAnbudMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
