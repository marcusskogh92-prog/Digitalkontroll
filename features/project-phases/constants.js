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
        { id: 'projektinfo', name: 'Projektinfo', component: 'ProjektinfoView', order: 1, enabled: true },
        { id: 'organisation-roller', name: 'Organisation & roller', component: 'OrganisationRollerView', order: 2, enabled: true },
        { id: 'kontaktlista', name: 'Kontaktlista', component: 'KontaktlistaView', order: 3, enabled: true },
        { id: 'tidsplan-viktiga-datum', name: 'Tidsplan & viktiga datum', component: 'TidsplanViktigaDatumView', order: 4, enabled: true },
        { id: 'status-beslut', name: 'Status & beslut', component: 'StatusBeslutView', order: 5, enabled: true },
        { id: 'ai-sammanfattning', name: 'AI-sammanfattning', component: 'AISammanfattningView', order: 6, enabled: true }
      ]
    },
    {
      id: 'forfragningsunderlag',
      name: '02 - Förfrågningsunderlag',
      icon: 'folder-outline',
      order: 2,
      items: [
        { id: 'administrativa-foreskrifter', name: 'Administrativa föreskrifter (AF)', component: 'AdministrativaForeskrifterView', order: 1, enabled: true },
        { id: 'tekniska-beskrivningar', name: 'Tekniska beskrivningar', component: 'TekniskaBeskrivningarView', order: 2, enabled: true },
        { id: 'ritningar', name: 'Ritningar', component: 'RitningarView', order: 3, enabled: true },
        { id: 'kompletteringar-andringar', name: 'Kompletteringar & ändringar', component: 'KompletteringarAndringarView', order: 4, enabled: true },
        { id: 'referenshandlingar', name: 'Referenshandlingar', component: 'ReferenshandlingarView', order: 5, enabled: true },
        { id: 'ai-analys-sammanstallning', name: 'AI-analys & sammanställning', component: 'AIAnalysSammanstallningView', order: 6, enabled: true }
      ]
    },
    {
      id: 'kalkyl',
      name: '03 - Kalkyl',
      icon: 'calculator-outline',
      order: 3,
      items: [
        { id: 'kalkylritningar', name: 'Kalkylritningar', component: 'KalkylritningarView', order: 1, enabled: true },
        { id: 'kalkylanteckningar', name: 'Kalkylanteckningar', component: 'KalkylanteckningarView', order: 2, enabled: true },
        { id: 'nettokalkyl', name: 'Nettokalkyl', component: 'NettokalkylView', order: 3, enabled: true },
        { id: 'offertkalkyl', name: 'Offertkalkyl', component: 'OffertkalkylView', order: 4, enabled: true },
        { id: 'omkostnadskalkyl', name: 'Omkostnadskalkyl', component: 'OmkostnadskalkylView', order: 5, enabled: true },
        { id: 'slutsida', name: 'Slutsida', component: 'SlutsidaView', order: 6, enabled: true }
      ]
    },
    {
      id: 'ue-offerter',
      name: '04 - UE & Offerter',
      icon: 'document-outline',
      order: 4,
      items: [
        { id: 'forfragningar', name: 'Förfrågningar', component: 'ForfragningarView', order: 1, enabled: true },
        { id: 'inkomna-offerter', name: 'Inkomna offerter', component: 'InkomnaOfferterView', order: 2, enabled: true },
        { id: 'jamforelser', name: 'Jämförelser', component: 'JamforelserView', order: 3, enabled: true },
        { id: 'vald-ue', name: 'Vald UE', component: 'ValdUEView', order: 4, enabled: true }
      ]
    },
    {
      id: 'konstruktion-berakningar',
      name: '05 - Konstruktion & beräkningar',
      icon: 'build-outline',
      order: 5,
      items: [
        { id: 'konstruktionsritningar', name: 'Konstruktionsritningar', component: 'KonstruktionsritningarView', order: 1, enabled: true },
        { id: 'statik-hallfasthet', name: 'Statik & hållfasthet', component: 'StatikHallfasthetView', order: 2, enabled: true },
        { id: 'brandskydd', name: 'Brandskydd', component: 'BrandskyddView', order: 3, enabled: true },
        { id: 'tillganglighet', name: 'Tillgänglighet', component: 'TillganglighetView', order: 4, enabled: true },
        { id: 'akustik', name: 'Akustik', component: 'AkustikView', order: 5, enabled: true },
        { id: 'energiberakningar', name: 'Energiberäkningar', component: 'EnergiberakningarView', order: 6, enabled: true },
        { id: 'geoteknik', name: 'Geoteknik', component: 'GeoteknikView', order: 7, enabled: true },
        { id: 'teknisk-samordning', name: 'Teknisk samordning', component: 'TekniskSamordningView', order: 8, enabled: true }
      ]
    },
    {
      id: 'myndigheter',
      name: '06 - Myndigheter',
      icon: 'business-outline',
      order: 6,
      items: [
        { id: 'bygglov', name: 'Bygglov', component: 'BygglovView', order: 1, enabled: true },
        { id: 'tekniskt-samrad', name: 'Tekniskt samråd', component: 'TeknisktSamradView', order: 2, enabled: true },
        { id: 'startbesked', name: 'Startbesked', component: 'StartbeskedView', order: 3, enabled: true },
        { id: 'kompletteringar', name: 'Kompletteringar', component: 'KompletteringarView', order: 4, enabled: true },
        { id: 'slutbesked', name: 'Slutbesked', component: 'SlutbeskedView', order: 5, enabled: true },
        { id: 'kommunikation', name: 'Kommunikation', component: 'KommunikationView', order: 6, enabled: true }
      ]
    },
    {
      id: 'risk-mojligheter',
      name: '07 - Risk / Möjligheter',
      icon: 'warning-outline',
      order: 7,
      items: [
        { id: 'identifierade-risker', name: 'Identifierade risker', component: 'IdentifieradeRiskerView', order: 1, enabled: true },
        { id: 'mojligheter', name: 'Möjligheter', component: 'MojligheterView', order: 2, enabled: true },
        { id: 'konsekvens-sannolikhet', name: 'Konsekvens & sannolikhet', component: 'KonsekvensSannolikhetView', order: 3, enabled: true },
        { id: 'atgardsplan', name: 'Åtgärdsplan', component: 'AtgardsplanView', order: 4, enabled: true },
        { id: 'ai-riskanalys', name: 'AI-riskanalys', component: 'AIRiskanalysView', order: 5, enabled: true }
      ]
    },
    {
      id: 'bilder',
      name: '08 - Bilder',
      icon: 'images-outline',
      order: 8,
      items: [
        { id: 'platsbesok', name: 'Platsbesök', component: 'PlatsbesokView', order: 1, enabled: true },
        { id: 'befintliga-forhallanden', name: 'Befintliga förhållanden', component: 'BefintligaForhallandenView', order: 2, enabled: true },
        { id: 'referensbilder', name: 'Referensbilder', component: 'ReferensbilderView', order: 3, enabled: true },
        { id: 'skador-avvikelser', name: 'Skador & avvikelser', component: 'SkadorAvvikelserView', order: 4, enabled: true },
        { id: 'ovrigt-bilder', name: 'Övrigt', component: 'OvrigtBilderView', order: 5, enabled: true }
      ]
    },
    {
      id: 'moten',
      name: '09 - Möten',
      icon: 'people-outline',
      order: 9,
      items: [
        { id: 'startmote', name: 'Startmöte', component: 'StartmoteView', order: 1, enabled: true },
        { id: 'kalkylmoten', name: 'Kalkylmöten', component: 'KalkylmotenView', order: 2, enabled: true },
        { id: 'ue-genomgang', name: 'UE-genomgång', component: 'UEGenomgangView', order: 3, enabled: true },
        { id: 'beslutsmoen', name: 'Beslutsmöten', component: 'BeslutsmoenView', order: 4, enabled: true },
        { id: 'protokoll', name: 'Protokoll', component: 'ProtokollView', order: 5, enabled: true }
      ]
    },
    {
      id: 'anbud',
      name: '10 - Anbud',
      icon: 'document-outline',
      order: 10,
      items: [
        { id: 'anbudsdokument', name: 'Anbudsdokument', component: 'AnbudsdokumentView', order: 1, enabled: true },
        { id: 'bilagor', name: 'Bilagor', component: 'BilagorView', order: 2, enabled: true },
        { id: 'kalkylsammanfattning', name: 'Kalkylsammanfattning', component: 'KalkylsammanfattningView', order: 3, enabled: true },
        { id: 'inlamnat-anbud', name: 'Inlämnat anbud', component: 'InlamnatAnbudView', order: 4, enabled: true },
        { id: 'utfall-feedback', name: 'Utfall & feedback', component: 'UtfallFeedbackView', order: 5, enabled: true }
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

/**
 * Get default navigation for a phase
 */
export function getDefaultNavigation(phaseKey) {
  switch (phaseKey) {
    case 'kalkylskede':
      return DEFAULT_KALKYLSKEDE_NAVIGATION;
    case 'produktion':
      return DEFAULT_PRODUKTION_NAVIGATION;
    case 'avslut':
      return DEFAULT_AVSLUT_NAVIGATION;
    case 'eftermarknad':
      return DEFAULT_EFTERMARKNAD_NAVIGATION;
    default:
      return DEFAULT_KALKYLSKEDE_NAVIGATION; // Fallback
  }
}
