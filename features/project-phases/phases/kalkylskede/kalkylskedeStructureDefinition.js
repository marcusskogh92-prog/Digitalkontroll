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
      '01 - Projektinformation',
      '02 - Organisation och roller',
      '03 - Tidsplan och viktiga datum',
      '04 - FrågaSvar',
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
    items: [
      '01 - Kalkylritningar',
      '02 - Kalkylanteckningar',
      '03 - Nettokalkyl',
      '04 - Offertkalkyl',
      '05 - Omkostnadskalkyl',
      '06 - Slutsida',
    ],
  },
  'ue-offerter': {
    title: 'UE och offerter',
    icon: 'document-outline',
    items: ['01 - Förfrågningar', '02 - Inkomna offerter', '03 - Jämförelser', '04 - Vald UE'],
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
    items: ['01 - Bygglov', '02 - Tekniskt samråd', '03 - Startbesked', '04 - Kompletteringar', '05 - Slutbesked', '06 - Kommunikation'],
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
    items: ['01 - Platsbesök', '02 - Befintliga förhållanden', '03 - Referensbilder', '04 - Skador och avvikelser', '05 - Övrigt'],
  },
  moten: {
    title: 'Möten',
    icon: 'people-outline',
    items: ['01 - Startmöte', '02 - Kalkylmöten', '03 - UE-genomgång', '04 - Beslutsmöten', '05 - Protokoll'],
  },
  anbud: {
    title: 'Anbud',
    icon: 'document-outline',
    items: ['01 - Anbudsdokument', '02 - Bilagor', '03 - Kalkylsammanfattning', '04 - Inlämnat anbud', '05 - Utfall och feedback'],
  },
};

const ORDER_BY_VERSION = {
  [KALKYLSKEDE_STRUCTURE_VERSIONS.V1]: [
    'oversikt',
    'forfragningsunderlag',
    'kalkyl',
    'ue-offerter',
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
    'ue-offerter',
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
  const FFU_SYSTEM_FOLDER = 'AI-sammanställning';

  return ids
    .map((id, idx) => {
      const def = SECTION_DEFS[id];
      if (!def) return null;
      const name = `${pad2(idx + 1)} - ${def.title}`;
      // FFU is user-controlled, with one system exception.
      if (id === 'forfragningsunderlag') {
        return { name, items: [FFU_SYSTEM_FOLDER] };
      }
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
            { id: 'projektinfo', name: '01 - Projektinformation', component: 'ProjektinfoView', order: 1, enabled: true },
            { id: 'organisation-roller', name: '02 - Organisation och roller', component: 'OrganisationRollerView', order: 2, enabled: true },
            { id: 'tidsplan-viktiga-datum', name: '03 - Tidsplan och viktiga datum', component: 'TidsplanViktigaDatumView', order: 3, enabled: true },
            { id: 'status-beslut', name: '04 - FrågaSvar', component: 'StatusBeslutView', order: 4, enabled: true },
          ];
        } else if (id === 'forfragningsunderlag') {
          // GOLDEN RULE (FFU): no fixed item navigation; browse folders directly.
          section.items = [];
        } else if (id === 'kalkyl') {
          section.items = [
            { id: 'kalkylritningar', name: '01 - Kalkylritningar', component: 'KalkylritningarView', order: 1, enabled: true },
            { id: 'kalkylanteckningar', name: '02 - Kalkylanteckningar', component: 'KalkylanteckningarView', order: 2, enabled: true },
            { id: 'nettokalkyl', name: '03 - Nettokalkyl', component: 'NettokalkylView', order: 3, enabled: true },
            { id: 'offertkalkyl', name: '04 - Offertkalkyl', component: 'OffertkalkylView', order: 4, enabled: true },
            { id: 'omkostnadskalkyl', name: '05 - Omkostnadskalkyl', component: 'OmkostnadskalkylView', order: 5, enabled: true },
            { id: 'slutsida', name: '06 - Slutsida', component: 'SlutsidaView', order: 6, enabled: true },
          ];
        } else if (id === 'ue-offerter') {
          section.items = [
            { id: 'forfragningar', name: '01 - Förfrågningar', component: 'ForfragningarView', order: 1, enabled: true },
            { id: 'inkomna-offerter', name: '02 - Inkomna offerter', component: 'InkomnaOfferterView', order: 2, enabled: true },
            { id: 'jamforelser', name: '03 - Jämförelser', component: 'JamforelserView', order: 3, enabled: true },
            { id: 'vald-ue', name: '04 - Vald UE', component: 'ValdUEView', order: 4, enabled: true },
          ];
        } else if (id === 'konstruktion-berakningar') {
          section.items = [
            { id: 'konstruktionsritningar', name: '01 - Konstruktionsritningar', component: 'KonstruktionsritningarView', order: 1, enabled: true },
            { id: 'statik-hallfasthet', name: '02 - Statik och hållfasthet', component: 'StatikHallfasthetView', order: 2, enabled: true },
            { id: 'brandskydd', name: '03 - Brandskydd', component: 'BrandskyddView', order: 3, enabled: true },
            { id: 'tillganglighet', name: '04 - Tillgänglighet', component: 'TillganglighetView', order: 4, enabled: true },
            { id: 'akustik', name: '05 - Akustik', component: 'AkustikView', order: 5, enabled: true },
            { id: 'energiberakningar', name: '06 - Energiberäkningar', component: 'EnergiberakningarView', order: 6, enabled: true },
            { id: 'geoteknik', name: '07 - Geoteknik', component: 'GeoteknikView', order: 7, enabled: true },
            { id: 'teknisk-samordning', name: '08 - Teknisk samordning', component: 'TekniskSamordningView', order: 8, enabled: true },
          ];
        } else if (id === 'myndigheter') {
          section.items = [
            { id: 'bygglov', name: '01 - Bygglov', component: 'BygglovView', order: 1, enabled: true },
            { id: 'tekniskt-samrad', name: '02 - Tekniskt samråd', component: 'TeknisktSamradView', order: 2, enabled: true },
            { id: 'startbesked', name: '03 - Startbesked', component: 'StartbeskedView', order: 3, enabled: true },
            { id: 'kompletteringar', name: '04 - Kompletteringar', component: 'KompletteringarView', order: 4, enabled: true },
            { id: 'slutbesked', name: '05 - Slutbesked', component: 'SlutbeskedView', order: 5, enabled: true },
            { id: 'kommunikation', name: '06 - Kommunikation', component: 'KommunikationView', order: 6, enabled: true },
          ];
        } else if (id === 'risk-mojligheter') {
          section.items = [
            { id: 'identifierade-risker', name: '01 - Identifierade risker', component: 'IdentifieradeRiskerView', order: 1, enabled: true },
            { id: 'mojligheter', name: '02 - Möjligheter', component: 'MojligheterView', order: 2, enabled: true },
            { id: 'konsekvens-sannolikhet', name: '03 - Konsekvens och sannolikhet', component: 'KonsekvensSannolikhetView', order: 3, enabled: true },
            { id: 'atgardsplan', name: '04 - Åtgärdsplan', component: 'AtgardsplanView', order: 4, enabled: true },
            { id: 'ai-riskanalys', name: '05 - AI-riskanalys', component: 'AIRiskanalysView', order: 5, enabled: true },
          ];
        } else if (id === 'bilder') {
          section.items = [
            { id: 'platsbesok', name: '01 - Platsbesök', component: 'PlatsbesokView', order: 1, enabled: true },
            { id: 'befintliga-forhallanden', name: '02 - Befintliga förhållanden', component: 'BefintligaForhallandenView', order: 2, enabled: true },
            { id: 'referensbilder', name: '03 - Referensbilder', component: 'ReferensbilderView', order: 3, enabled: true },
            { id: 'skador-avvikelser', name: '04 - Skador och avvikelser', component: 'SkadorAvvikelserView', order: 4, enabled: true },
            { id: 'ovrigt-bilder', name: '05 - Övrigt', component: 'OvrigtBilderView', order: 5, enabled: true },
          ];
        } else if (id === 'moten') {
          section.items = [
            { id: 'startmote', name: '01 - Startmöte', component: 'StartmoteView', order: 1, enabled: true },
            { id: 'kalkylmoten', name: '02 - Kalkylmöten', component: 'KalkylmotenView', order: 2, enabled: true },
            { id: 'ue-genomgang', name: '03 - UE-genomgång', component: 'UEGenomgangView', order: 3, enabled: true },
            { id: 'beslutsmoen', name: '04 - Beslutsmöten', component: 'BeslutsmoenView', order: 4, enabled: true },
            { id: 'protokoll', name: '05 - Protokoll', component: 'ProtokollView', order: 5, enabled: true },
          ];
        } else if (id === 'anbud') {
          section.items = [
            { id: 'anbudsdokument', name: '01 - Anbudsdokument', component: 'AnbudsdokumentView', order: 1, enabled: true },
            { id: 'bilagor', name: '02 - Bilagor', component: 'BilagorView', order: 2, enabled: true },
            { id: 'kalkylsammanfattning', name: '03 - Kalkylsammanfattning', component: 'KalkylsammanfattningView', order: 3, enabled: true },
            { id: 'inlamnat-anbud', name: '04 - Inlämnat anbud', component: 'InlamnatAnbudView', order: 4, enabled: true },
            { id: 'utfall-feedback', name: '05 - Utfall och feedback', component: 'UtfallFeedbackView', order: 5, enabled: true },
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

  if (has('09 - Kalkyl') || has('03 - UE och offerter')) return KALKYLSKEDE_STRUCTURE_VERSIONS.V2;
  if (has('03 - Kalkyl') || has('04 - UE och offerter')) return KALKYLSKEDE_STRUCTURE_VERSIONS.V1;

  return null;
}
