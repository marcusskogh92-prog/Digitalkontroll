/**
 * Project Phases - Navigation Constants
 * Default navigation structure for each phase
 */

export const DEFAULT_KALKYLSKEDE_NAVIGATION = {
  phase: 'kalkylskede',
  sections: [
    {
      id: 'oversikt',
      name: '01 - Översikt',
      icon: 'list-outline',
      order: 1,
      items: [
        { id: 'projektinfo', name: '01 - Projektinformation', component: 'ProjektinfoView', order: 1, enabled: true },
        { id: 'organisation-roller', name: '02 - Organisation och roller', component: 'OrganisationRollerView', order: 2, enabled: true },
        { id: 'tidsplan-viktiga-datum', name: '03 - Tidsplan och viktiga datum', component: 'TidsplanViktigaDatumView', order: 3, enabled: true },
        { id: 'status-beslut', name: '04 - FrågaSvar', component: 'StatusBeslutView', order: 4, enabled: true }
      ]
    },
    {
      id: 'forfragningsunderlag',
      name: '02 - Förfrågningsunderlag',
      icon: 'folder-outline',
      order: 2,
      items: [
        { id: 'administrativa-foreskrifter', name: '01 - Administrativa föreskrifter (AF)', component: 'AdministrativaForeskrifterView', order: 1, enabled: true },
        { id: 'tekniska-beskrivningar', name: '02 - Tekniska beskrivningar', component: 'TekniskaBeskrivningarView', order: 2, enabled: true },
        { id: 'ritningar', name: '03 - Ritningar', component: 'RitningarView', order: 3, enabled: true },
        { id: 'kompletteringar-andringar', name: '04 - Kompletteringar och ändringar', component: 'KompletteringarAndringarView', order: 4, enabled: true },
        { id: 'referenshandlingar', name: '05 - Referenshandlingar', component: 'ReferenshandlingarView', order: 5, enabled: true },
        { id: 'ai-analys-sammanstallning', name: '06 - AI-analys och sammanställning', component: 'AIAnalysSammanstallningView', order: 6, enabled: true }
      ]
    },
    {
      id: 'kalkyl',
      name: '03 - Kalkyl',
      icon: 'calculator-outline',
      order: 3,
      items: [
        { id: 'kalkylritningar', name: '01 - Kalkylritningar', component: 'KalkylritningarView', order: 1, enabled: true },
        { id: 'kalkylanteckningar', name: '02 - Kalkylanteckningar', component: 'KalkylanteckningarView', order: 2, enabled: true },
        { id: 'nettokalkyl', name: '03 - Nettokalkyl', component: 'NettokalkylView', order: 3, enabled: true },
        { id: 'offertkalkyl', name: '04 - Offertkalkyl', component: 'OffertkalkylView', order: 4, enabled: true },
        { id: 'omkostnadskalkyl', name: '05 - Omkostnadskalkyl', component: 'OmkostnadskalkylView', order: 5, enabled: true },
        { id: 'slutsida', name: '06 - Slutsida', component: 'SlutsidaView', order: 6, enabled: true }
      ]
    },
    {
      id: 'ue-offerter',
      name: '04 - UE och offerter',
      icon: 'document-outline',
      order: 4,
      items: [
        { id: 'forfragningar', name: '01 - Förfrågningar', component: 'ForfragningarView', order: 1, enabled: true },
        { id: 'inkomna-offerter', name: '02 - Inkomna offerter', component: 'InkomnaOfferterView', order: 2, enabled: true },
        { id: 'jamforelser', name: '03 - Jämförelser', component: 'JamforelserView', order: 3, enabled: true },
        { id: 'vald-ue', name: '04 - Vald UE', component: 'ValdUEView', order: 4, enabled: true }
      ]
    },
    {
      id: 'konstruktion-berakningar',
      name: '05 - Konstruktion och beräkningar',
      icon: 'build-outline',
      order: 5,
      items: [
        { id: 'konstruktionsritningar', name: '01 - Konstruktionsritningar', component: 'KonstruktionsritningarView', order: 1, enabled: true },
        { id: 'statik-hallfasthet', name: '02 - Statik och hållfasthet', component: 'StatikHallfasthetView', order: 2, enabled: true },
        { id: 'brandskydd', name: '03 - Brandskydd', component: 'BrandskyddView', order: 3, enabled: true },
        { id: 'tillganglighet', name: '04 - Tillgänglighet', component: 'TillganglighetView', order: 4, enabled: true },
        { id: 'akustik', name: '05 - Akustik', component: 'AkustikView', order: 5, enabled: true },
        { id: 'energiberakningar', name: '06 - Energiberäkningar', component: 'EnergiberakningarView', order: 6, enabled: true },
        { id: 'geoteknik', name: '07 - Geoteknik', component: 'GeoteknikView', order: 7, enabled: true },
        { id: 'teknisk-samordning', name: '08 - Teknisk samordning', component: 'TekniskSamordningView', order: 8, enabled: true }
      ]
    },
    {
      id: 'myndigheter',
      name: '06 - Myndigheter',
      icon: 'business-outline',
      order: 6,
      items: [
        { id: 'bygglov', name: '01 - Bygglov', component: 'BygglovView', order: 1, enabled: true },
        { id: 'tekniskt-samrad', name: '02 - Tekniskt samråd', component: 'TeknisktSamradView', order: 2, enabled: true },
        { id: 'startbesked', name: '03 - Startbesked', component: 'StartbeskedView', order: 3, enabled: true },
        { id: 'kompletteringar', name: '04 - Kompletteringar', component: 'KompletteringarView', order: 4, enabled: true },
        { id: 'slutbesked', name: '05 - Slutbesked', component: 'SlutbeskedView', order: 5, enabled: true },
        { id: 'kommunikation', name: '06 - Kommunikation', component: 'KommunikationView', order: 6, enabled: true }
      ]
    },
    {
      id: 'risk-mojligheter',
      name: '07 - Risk och möjligheter',
      icon: 'warning-outline',
      order: 7,
      items: [
        { id: 'identifierade-risker', name: '01 - Identifierade risker', component: 'IdentifieradeRiskerView', order: 1, enabled: true },
        { id: 'mojligheter', name: '02 - Möjligheter', component: 'MojligheterView', order: 2, enabled: true },
        { id: 'konsekvens-sannolikhet', name: '03 - Konsekvens och sannolikhet', component: 'KonsekvensSannolikhetView', order: 3, enabled: true },
        { id: 'atgardsplan', name: '04 - Åtgärdsplan', component: 'AtgardsplanView', order: 4, enabled: true },
        { id: 'ai-riskanalys', name: '05 - AI-riskanalys', component: 'AIRiskanalysView', order: 5, enabled: true }
      ]
    },
    {
      id: 'bilder',
      name: '08 - Bilder',
      icon: 'images-outline',
      order: 8,
      items: [
        { id: 'platsbesok', name: '01 - Platsbesök', component: 'PlatsbesokView', order: 1, enabled: true },
        { id: 'befintliga-forhallanden', name: '02 - Befintliga förhållanden', component: 'BefintligaForhallandenView', order: 2, enabled: true },
        { id: 'referensbilder', name: '03 - Referensbilder', component: 'ReferensbilderView', order: 3, enabled: true },
        { id: 'skador-avvikelser', name: '04 - Skador och avvikelser', component: 'SkadorAvvikelserView', order: 4, enabled: true },
        { id: 'ovrigt-bilder', name: '05 - Övrigt', component: 'OvrigtBilderView', order: 5, enabled: true }
      ]
    },
    {
      id: 'moten',
      name: '09 - Möten',
      icon: 'people-outline',
      order: 9,
      items: [
        { id: 'startmote', name: '01 - Startmöte', component: 'StartmoteView', order: 1, enabled: true },
        { id: 'kalkylmoten', name: '02 - Kalkylmöten', component: 'KalkylmotenView', order: 2, enabled: true },
        { id: 'ue-genomgang', name: '03 - UE-genomgång', component: 'UEGenomgangView', order: 3, enabled: true },
        { id: 'beslutsmoen', name: '04 - Beslutsmöten', component: 'BeslutsmoenView', order: 4, enabled: true },
        { id: 'protokoll', name: '05 - Protokoll', component: 'ProtokollView', order: 5, enabled: true }
      ]
    },
    {
      id: 'anbud',
      name: '10 - Anbud',
      icon: 'document-outline',
      order: 10,
      items: [
        { id: 'anbudsdokument', name: '01 - Anbudsdokument', component: 'AnbudsdokumentView', order: 1, enabled: true },
        { id: 'bilagor', name: '02 - Bilagor', component: 'BilagorView', order: 2, enabled: true },
        { id: 'kalkylsammanfattning', name: '03 - Kalkylsammanfattning', component: 'KalkylsammanfattningView', order: 3, enabled: true },
        { id: 'inlamnat-anbud', name: '04 - Inlämnat anbud', component: 'InlamnatAnbudView', order: 4, enabled: true },
        { id: 'utfall-feedback', name: '05 - Utfall och feedback', component: 'UtfallFeedbackView', order: 5, enabled: true }
      ]
    }
  ]
};

// Default navigation for other phases (can be customized later)
export const DEFAULT_PRODUKTION_NAVIGATION = {
  phase: 'produktion',
  sections: [
    {
      id: 'oversikt',
      name: 'Översikt',
      icon: 'list-outline',
      order: 1,
      items: []
    }
  ]
};

export const DEFAULT_AVSLUT_NAVIGATION = {
  phase: 'avslut',
  sections: [
    {
      id: 'oversikt',
      name: 'Översikt',
      icon: 'list-outline',
      order: 1,
      items: []
    }
  ]
};

export const DEFAULT_EFTERMARKNAD_NAVIGATION = {
  phase: 'eftermarknad',
  sections: [
    {
      id: 'oversikt',
      name: 'Översikt',
      icon: 'list-outline',
      order: 1,
      items: []
    }
  ]
};

function cloneNavigationWithPhase(source, phaseKey) {
  const src = source || {};
  const sections = Array.isArray(src.sections) ? src.sections : [];
  return {
    ...src,
    phase: phaseKey,
    sections: sections.map((section) => {
      const items = Array.isArray(section?.items) ? section.items : [];
      return {
        ...section,
        items: items.map((item) => {
          const nestedItems = Array.isArray(item?.items) ? item.items : null;
          return {
            ...item,
            ...(nestedItems ? { items: nestedItems.map((sub) => ({ ...sub })) } : null),
          };
        }),
      };
    }),
  };
}

/**
 * Get default navigation for a phase
 */
export function getDefaultNavigation(phaseKey) {
  switch (phaseKey) {
    case 'kalkylskede':
      return DEFAULT_KALKYLSKEDE_NAVIGATION;
    case 'produktion':
      // Until production has its own navigation, reuse kalkyl structure so leftpanel behaves the same.
      return cloneNavigationWithPhase(DEFAULT_KALKYLSKEDE_NAVIGATION, 'produktion');
    case 'avslut':
      // Until avslut has its own navigation, reuse kalkyl structure so leftpanel behaves the same.
      return cloneNavigationWithPhase(DEFAULT_KALKYLSKEDE_NAVIGATION, 'avslut');
    case 'eftermarknad':
      // Until eftermarknad has its own navigation, reuse kalkyl structure so leftpanel behaves the same.
      return cloneNavigationWithPhase(DEFAULT_KALKYLSKEDE_NAVIGATION, 'eftermarknad');
    default:
      return DEFAULT_KALKYLSKEDE_NAVIGATION; // Fallback
  }
}
