/**
 * Offerter Section
 */

import { StyleSheet, Text, View } from 'react-native';

import OfferterView from '../../../../../../modules/offerter/offerter/OfferterView';
import ForfragningarView from './items/Forfragningar/ForfragningarView';

function Placeholder({ label, activeItem }) {
  return (
    <View style={styles.placeholderWrap}>
      <Text style={styles.placeholderTitle}>{label}</Text>
      {activeItem ? <Text style={styles.placeholderSub}>Aktivt item: {activeItem}</Text> : null}
      <Text style={styles.placeholderHint}>Denna vy kommer att implementeras här.</Text>
    </View>
  );
}

const ITEM_COMPONENTS = {
  // 01 - Förfrågningar (primary startpoint)
  forfragningar: ForfragningarView,
  // 02 - Offerter
  offerter: OfferterView,
  // Backwards compatible alias
  'inkomna-offerter': OfferterView,
};

export default function OfferterSection({ projectId, companyId, project, activeItem, navigation, navigationParams }) {
  if (!activeItem) {
    return <Placeholder label="Offerter" activeItem={null} />;
  }

  const ItemComponent = ITEM_COMPONENTS[activeItem];

  if (!ItemComponent) {
    return <Placeholder label="Offerter" activeItem={activeItem} />;
  }

  return (
    <View style={styles.container}>
      <ItemComponent
        projectId={projectId}
        companyId={companyId}
        project={project}
        activeItem={activeItem}
        sectionNavigation={navigation}
        navigationParams={navigationParams}
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
  placeholderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  placeholderSub: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  placeholderHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
