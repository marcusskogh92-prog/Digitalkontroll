import { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';

import ForfragningarView from '../../modules/offerter/forfragningar/ForfragningarView';
import OfferterView from '../../modules/offerter/offerter/OfferterView';

const OFFERTER_SECTION_NAV = {
  id: 'offerter',
  name: '03 - Offerter',
  items: [
    { id: 'forfragningar', name: '01 - Förfrågningar' },
    { id: 'offerter', name: '02 - Offerter' },
    { id: 'jamforelser', name: '03 - Jämförelser' },
    { id: 'vald-ue', name: '04 - Vald UE' },
  ],
};

function Placeholder({ title }) {
  return (
    <View style={{ flex: 1, padding: 18 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>{title}</Text>
      <Text style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Vyn är inte implementerad ännu.</Text>
    </View>
  );
}

function normalizeOfferterItemId(itemId) {
  const raw = String(itemId || '').trim();
  if (!raw) return 'forfragningar';
  if (raw === 'inkomna-offerter' || raw === '02-offerter' || raw === '02_offerter') return 'offerter';
  return raw;
}

export default function OfferterLayout({ companyId, projectId, project, activeItemId }) {
  const resolvedActiveItemId = useMemo(
    () => normalizeOfferterItemId(activeItemId),
    [activeItemId],
  );

  // Note: some existing views expect activeItem to be the item id string.
  const activeItem = resolvedActiveItemId;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: isWeb ? 'transparent' : '#fff' }}>
      {resolvedActiveItemId === 'forfragningar' ? (
        <ForfragningarView
          companyId={companyId}
          projectId={projectId}
          project={project}
          activeItem={activeItem}
          sectionNavigation={OFFERTER_SECTION_NAV}
        />
      ) : resolvedActiveItemId === 'offerter' ? (
        <OfferterView companyId={companyId} projectId={projectId} project={project} activeItem={activeItem} sectionNavigation={OFFERTER_SECTION_NAV} />
      ) : resolvedActiveItemId === 'jamforelser' ? (
        <Placeholder title="Jämförelser" />
      ) : resolvedActiveItemId === 'vald-ue' ? (
        <Placeholder title="Vald UE" />
      ) : (
        <Placeholder title="Offerter" />
      )}
    </View>
  );
}
