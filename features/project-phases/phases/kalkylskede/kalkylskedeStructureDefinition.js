/**
 * Kalkylskede structure definition (single source of truth)
 *
 * IMPORTANT:
 * - Changing numeric prefixes here impacts BOTH:
 *   1) UI left menu ordering (sort/order)
 *   2) SharePoint folder names created for NEW projects
 *
 * Do NOT change prefixes without ensuring the UI and SharePoint templates remain synced.
 * Also: never run rename/move operations on existing SharePoint libraries as part of this.
 */

export const KALKYLSKEDE_STRUCTURE_VERSIONS = {
  V1: 'v1',
  V2: 'v2',
};

const pad2 = (n) => String(Number(n) || 0).padStart(2, '0');

const SECTION_DEFS = {
  oversikt: {
    title: 'Översikt',
    icon: 'list-outline',
    items: [
      '01 - Checklista',
      '02 - Projektinformation',
      '03 - Organisation och roller',
      '04 - Tidsplan och viktiga datum',
      '05 - FrågaSvar',
    ],
  },
  forfragningsunderlag: {
    title: 'Förfrågningsunderlag',
    icon: 'folder-outline',
    // GOLDEN RULE (FFU): no fixed subfolder structure; users manage their own folders.
    items: [],
  },
  kalkyl: {
    title: 'Kalkyl',
    icon: 'calculator-outline',
    // 3 undermappar + AI-analys (ingen mapp); AI-analys analyserar underlag + kalkyl.
    items: ['01 - Kalkylritningar', '02 - Kalkylanteckningar', '03 - Kalkyl'],
  },
  // Inköp & offerter: två hårdkodade flikar (Förfrågningar, Offerter) + egna flikar med utforskare.
  // Basflikar kan raderas om man vill köra enbart utforskare med egen mappstruktur.
  offerter: {
    title: 'Inköp och offerter',
    icon: 'document-outline',
    items: ['01 - Förfrågningar', '02 - Offerter'],
  },
  'konstruktion-berakningar': {
    title: 'Konstruktion och beräkningar',
    icon: 'build-outline',
    items: [
      '01 - Konstruktionsritningar',
      '02 - Statik och hållfasthet',
      '03 - Brandskydd',
      '04 - Tillgänglighet',
      '05 - Akustik',
      '06 - Energiberäkningar',
      '07 - Geoteknik',
      '08 - Teknisk samordning',
    ],
  },
  myndigheter: {
    title: 'Myndigheter',
    icon: 'business-outline',
    // GOLDEN RULE (Myndigheter): no fixed subfolder structure; users manage flikar/folders.
    items: [],
  },
  'risk-mojligheter': {
    title: 'Risk och möjligheter',
    icon: 'warning-outline',
    items: [
      '01 - Identifierade risker',
      '02 - Möjligheter',
      '03 - Konsekvens och sannolikhet',
      '04 - Åtgärdsplan',
      '05 - AI-riskanalys',
    ],
  },
  bilder: {
    title: 'Bilder',
    icon: 'images-outline',
    // GOLDEN RULE (Bilder): no fixed subfolder structure; users manage flikar/folders like Förfrågningsunderlag.
    items: [],
  },
  moten: {
    title: 'Möten',
    icon: 'people-outline',
    items: ['01 - Startmöte', '02 - Kalkylmöten', '03 - UE-genomgång', '04 - Beslutsmöten', '05 - Protokoll'],
  },
  anbud: {
    title: 'Anbud',
    icon: 'document-outline',
    // Bilagor borttagen; flikar använder utforskaren (DigitalkontrollsUtforskare).
    items: ['01 - Anbudsdokument', '03 - Kalkylsammanfattning', '04 - Inlämnat anbud', '05 - Utfall och feedback'],
  },
};

const ORDER_BY_VERSION = {
  [KALKYLSKEDE_STRUCTURE_VERSIONS.V1]: [
    'oversikt',
    'forfragningsunderlag',
    'kalkyl',
    'offerter',
    'konstruktion-berakningar',
    'myndigheter',
    'risk-mojligheter',
    'bilder',
    'moten',
    'anbud',
  ],

  // New order: Kalkyl is late (between Möten and Anbud)
  [KALKYLSKEDE_STRUCTURE_VERSIONS.V2]: [
    'oversikt',
    'forfragningsunderlag',
    'offerter',
    'konstruktion-berakningar',
    'myndigheter',
    'risk-mojligheter',
    'bilder',
    'moten',
    'kalkyl',
    'anbud',
  ],
};

export function buildKalkylskedeLockedStructure(version = KALKYLSKEDE_STRUCTURE_VERSIONS.V1) {
  const v = ORDER_BY_VERSION[version] ? version : KALKYLSKEDE_STRUCTURE_VERSIONS.V1;
  const ids = ORDER_BY_VERSION[v];

  return ids
    .map((id, idx) => {
      const def = SECTION_DEFS[id];
      if (!def) return null;
      const name = `${pad2(idx + 1)} - ${def.title}`;
      // FFU is user-controlled (no fixed subfolder structure).
      return { name, items: Array.isArray(def.items) ? [...def.items] : [] };
    })
    .filter(Boolean);
}

export function buildKalkylskedeNavigation(version = KALKYLSKEDE_STRUCTURE_VERSIONS.V1) {
  const v = ORDER_BY_VERSION[version] ? version : KALKYLSKEDE_STRUCTURE_VERSIONS.V1;
  const ids = ORDER_BY_VERSION[v];

  return {
    phase: 'kalkylskede',
    sections: ids
      .map((id, idx) => {
        const def = SECTION_DEFS[id];
        if (!def) return null;

        // Note: IDs/keys/routes MUST remain stable. We only adjust name + order.
        const section = {
          id,
          name: `${pad2(idx + 1)} - ${def.title}`,
          icon: def.icon,
          order: idx + 1,
          items: [],
        };

        const items = Array.isArray(def.items) ? def.items : [];

        // Map section items to match existing IDs/components.
        // These are intentionally not versioned; only the SECTION ordering is.
        if (id === 'oversikt') {
          section.items = [
            { id: 'checklista', name: '01 - Checklista', component: 'ChecklistaView', order: 1, enabled: true },
            { id: 'projektinfo', name: '02 - Projektinformation', component: 'ProjektinfoView', order: 2, enabled: true },
            { id: 'organisation-roller', name: '03 - Organisation och roller', component: 'OrganisationRollerView', order: 3, enabled: true },
            { id: 'tidsplan-viktiga-datum', name: '04 - Tidsplan och viktiga datum', component: 'TidsplanViktigaDatumView', order: 4, enabled: true },
            { id: 'status-beslut', name: '05 - FrågaSvar', component: 'StatusBeslutView', order: 5, enabled: true },
          ];
        } else if (id === 'forfragningsunderlag') {
          // GOLDEN RULE (FFU): AI-analys alltid från start; övriga flikar = användarskapade mappar.
          section.items = [
            { id: 'ai-summary', name: 'AI-analys', component: 'FFUAISummaryView', order: 0, enabled: true, sharePointName: '', isSystemItem: true },
          ];
        } else if (id === 'kalkyl') {
          section.items = [
            { id: 'kalkylritningar', name: '01 - Kalkylritningar', component: 'DigitalkontrollsUtforskare', order: 1, enabled: true },
            { id: 'kalkylanteckningar', name: '02 - Kalkylanteckningar', component: 'DigitalkontrollsUtforskare', order: 2, enabled: true },
            { id: 'kalkyl-samling', name: '03 - Kalkyl', component: 'DigitalkontrollsUtforskare', order: 3, enabled: true },
            { id: 'ai-kalkyl-analys', name: '04 - AI-analys', component: 'AIKalkylAnalysView', order: 4, enabled: true },
          ];
        } else if (id === 'offerter') {
          // Två hårdkodade flikar (inga utforskare) + egna flikar får DigitalkontrollsUtforskare.
          section.items = [
            { id: 'forfragningar', name: '01 - Förfrågningar', component: 'ForfragningarView', order: 1, enabled: true },
            { id: 'offerter', name: '02 - Offerter', component: 'OfferterView', order: 2, enabled: true },
          ];
        } else if (id === 'konstruktion-berakningar') {
          // Flikar använder DigitalkontrollsUtforskare (samma mönster som Anbud/Kalkyl).
          section.items = [
            { id: 'konstruktionsritningar', name: '01 - Konstruktionsritningar', component: 'DigitalkontrollsUtforskare', order: 1, enabled: true },
            { id: 'statik-hallfasthet', name: '02 - Statik och hållfasthet', component: 'DigitalkontrollsUtforskare', order: 2, enabled: true },
            { id: 'brandskydd', name: '03 - Brandskydd', component: 'DigitalkontrollsUtforskare', order: 3, enabled: true },
            { id: 'tillganglighet', name: '04 - Tillgänglighet', component: 'DigitalkontrollsUtforskare', order: 4, enabled: true },
            { id: 'akustik', name: '05 - Akustik', component: 'DigitalkontrollsUtforskare', order: 5, enabled: true },
            { id: 'energiberakningar', name: '06 - Energiberäkningar', component: 'DigitalkontrollsUtforskare', order: 6, enabled: true },
            { id: 'geoteknik', name: '07 - Geoteknik', component: 'DigitalkontrollsUtforskare', order: 7, enabled: true },
            { id: 'teknisk-samordning', name: '08 - Teknisk samordning', component: 'DigitalkontrollsUtforskare', order: 8, enabled: true },
          ];
        } else if (id === 'myndigheter') {
          // GOLDEN RULE (Myndigheter): no fixed item navigation; browse folders directly, create flikar.
          section.items = [];
        } else if (id === 'risk-mojligheter') {
          section.items = [
            { id: 'identifierade-risker', name: '01 - Identifierade risker', component: 'IdentifieradeRiskerView', order: 1, enabled: true },
            { id: 'mojligheter', name: '02 - Möjligheter', component: 'MojligheterView', order: 2, enabled: true },
            { id: 'konsekvens-sannolikhet', name: '03 - Konsekvens och sannolikhet', component: 'KonsekvensSannolikhetView', order: 3, enabled: true },
            { id: 'atgardsplan', name: '04 - Åtgärdsplan', component: 'AtgardsplanView', order: 4, enabled: true },
            { id: 'ai-riskanalys', name: '05 - AI-riskanalys', component: 'AIRiskanalysView', order: 5, enabled: true },
          ];
        } else if (id === 'bilder') {
          // GOLDEN RULE (Bilder): no fixed item navigation; browse folders directly, create flikar.
          section.items = [];
        } else if (id === 'moten') {
          section.items = [
            { id: 'startmote', name: '01 - Startmöte', component: 'StartmoteView', order: 1, enabled: true },
            { id: 'kalkylmoten', name: '02 - Kalkylmöten', component: 'KalkylmotenView', order: 2, enabled: true },
            { id: 'ue-genomgang', name: '03 - UE-genomgång', component: 'UEGenomgangView', order: 3, enabled: true },
            { id: 'beslutsmoen', name: '04 - Beslutsmöten', component: 'BeslutsmoenView', order: 4, enabled: true },
            { id: 'protokoll', name: '05 - Protokoll', component: 'ProtokollView', order: 5, enabled: true },
          ];
        } else if (id === 'anbud') {
          // Flikar använder DigitalkontrollsUtforskare; rootPath sätts i useMergedSectionItems.
          section.items = [
            { id: 'anbudsdokument', name: '01 - Anbudsdokument', component: 'DigitalkontrollsUtforskare', order: 1, enabled: true },
            { id: 'ai-anbud-analys', name: '03 - AI-analys', component: 'AIKalkylAnalysView', order: 2, enabled: true, isSystemItem: true },
            { id: 'inlamnat-anbud', name: '04 - Inlämnat anbud', component: 'DigitalkontrollsUtforskare', order: 3, enabled: true },
            { id: 'utfall-feedback', name: '05 - Utfall och feedback', component: 'DigitalkontrollsUtforskare', order: 4, enabled: true },
          ];
        } else {
          // Fallback to empty
          section.items = items.map((name, i) => ({ id: `${id}-${i + 1}`, name, component: null, order: i + 1, enabled: true }));
        }

        return section;
      })
      .filter(Boolean),
  };
}

export function detectKalkylskedeStructureVersionFromSectionFolderNames(folderNames) {
  const names = Array.isArray(folderNames) ? folderNames.map((n) => String(n || '').trim()) : [];
  const has = (needle) => names.some((n) => n.toLowerCase() === String(needle || '').trim().toLowerCase());

  if (has('09 - Kalkyl') || has('03 - UE och offerter') || has('03 - Offerter') || has('03 - Inköp och offerter')) return KALKYLSKEDE_STRUCTURE_VERSIONS.V2;
  if (has('03 - Kalkyl') || has('04 - UE och offerter') || has('04 - Offerter')) return KALKYLSKEDE_STRUCTURE_VERSIONS.V1;

  return null;
}
