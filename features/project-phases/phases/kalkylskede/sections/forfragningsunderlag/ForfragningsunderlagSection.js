/**
 * Förfrågningsunderlag Section
 */

import { StyleSheet, Text, View } from 'react-native';
import AFFileListView from './items/AFFileListView';

export default function ForfragningsunderlagSection({ companyId, project, activeItem, activeNode, navigation, afRelativePath = '', setAfRelativePath = null, afSelectedItemId = null, setAfSelectedItemId = null, bumpAfMirrorRefreshNonce = null }) {
  const normalizedNode = (() => {
    if (activeNode && typeof activeNode === 'object') return activeNode;

    // Backwards-compatible fallback: derive a node from the activeItem id.
    const itemId = String(activeItem || '').trim();
    if (!itemId) return null;

    const key = itemId === 'administrativa-foreskrifter' ? 'AF' : null;

    return {
      id: itemId,
      key,
      type: 'phase-item',
      sharePointPath: null,
    };
  })();

  const hasItemSelected = Boolean(String(activeItem || '').trim());
  const effectiveNode = !hasItemSelected && String(normalizedNode?.type || '') === 'phase-section-folder' ? null : normalizedNode;

  console.log('[ForfragningsunderlagSection] Active node:', effectiveNode);

  if (effectiveNode?.key === 'AF') {
    return (
      <AFFileListView
        companyId={companyId}
        project={project}
        afRelativePath={afRelativePath}
        setAfRelativePath={setAfRelativePath}
        afSelectedItemId={afSelectedItemId}
        setAfSelectedItemId={setAfSelectedItemId}
        bumpAfMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
      />
    );
  }

  return (
    <View style={styles.container}>
      {effectiveNode ? (
        <Text style={styles.placeholderText}>
          Ingen vy kopplad till vald mapp: {String(effectiveNode?.key || effectiveNode?.id || 'okänd')}
        </Text>
      ) : (
        <Text style={styles.placeholderText}>Välj en mapp i menyn till vänster.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  itemText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
});
