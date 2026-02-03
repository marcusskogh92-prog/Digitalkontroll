/**
 * Project Phases - Navigation Constants
 * Default navigation structure for each phase
 */

import { buildKalkylskedeNavigation, KALKYLSKEDE_STRUCTURE_VERSIONS } from './phases/kalkylskede/kalkylskedeStructureDefinition';

// NOTE:
// - DEFAULT_KALKYLSKEDE_NAVIGATION remains the legacy (v1) structure.
// - v2 (Kalkyl late, between Möten and Anbud) must only be applied to NEW projects.
export const DEFAULT_KALKYLSKEDE_NAVIGATION = buildKalkylskedeNavigation(KALKYLSKEDE_STRUCTURE_VERSIONS.V1);
export const DEFAULT_KALKYLSKEDE_NAVIGATION_V2 = buildKalkylskedeNavigation(KALKYLSKEDE_STRUCTURE_VERSIONS.V2);

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
            ...(nestedItems ? { items: nestedItems.map((sub) => ({ ...sub })) } : {}),
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

/**
 * Get default navigation for a specific project.
 *
 * This is used to keep "default" behavior versioned so existing projects are not affected
 * when we adjust ordering/prefixes for NEW projects.
 */
export function getDefaultNavigationForProject(phaseKey, project) {
  const pk = String(phaseKey || '').trim().toLowerCase();
  if (pk !== 'kalkylskede') return getDefaultNavigation(phaseKey);

  const v = String(project?.kalkylskedeStructureVersion || '').trim().toLowerCase();
  if (v === 'v2') return DEFAULT_KALKYLSKEDE_NAVIGATION_V2;

  return DEFAULT_KALKYLSKEDE_NAVIGATION;
}
