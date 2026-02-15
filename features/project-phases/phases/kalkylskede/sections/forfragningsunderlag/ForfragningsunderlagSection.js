/**
 * Förfrågningsunderlag Section
 */

import { StyleSheet, View } from 'react-native';
import FFUFileListView from './items/FFUFileListView';

export default function ForfragningsunderlagSection({ companyId, project, activeItem, activeNode, navigation, afRelativePath = '', setAfRelativePath = null, afSelectedItemId = null, setAfSelectedItemId = null, bumpAfMirrorRefreshNonce = null, hiddenCustomFolderNames = [] }) {
  return (
    <View style={styles.container}>
      <FFUFileListView
        companyId={companyId}
        project={project}
        showCreateFolderButton
        hiddenCustomFolderNames={hiddenCustomFolderNames}
        ffuRelativePath={afRelativePath}
        setFfuRelativePath={setAfRelativePath}
        ffuSelectedItemId={afSelectedItemId}
        setFfuSelectedItemId={setAfSelectedItemId}
        bumpFfuMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
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
