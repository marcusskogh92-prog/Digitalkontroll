import { useMemo } from 'react';
import { Platform, View } from 'react-native';

import ForfragningarView from '../../modules/offerter/forfragningar/ForfragningarView';

const OFFERTER_SECTION_NAV = {
  id: 'offerter',
  name: 'Inköp och offerter',
  items: [{ id: 'forfragningar', name: 'Inköp och offerter' }],
};

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
      <ForfragningarView
        companyId={companyId}
        projectId={projectId}
        project={project}
        activeItem={activeItem}
        sectionNavigation={OFFERTER_SECTION_NAV}
      />
    </View>
  );
}
