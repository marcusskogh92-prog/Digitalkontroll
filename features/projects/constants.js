/**
 * Projektfaser - Konstanter
 */

export const PROJECT_PHASES = [
  { 
    id: 'phase-kalkylskede',
    key: 'kalkylskede',
    name: 'Kalkylskede', 
    color: '#1976D2', 
    icon: 'calculator-outline',
    order: 1
  },
  { 
    id: 'phase-produktion',
    key: 'produktion',
    name: 'Produktion', 
    color: '#43A047', 
    icon: 'construct-outline',
    order: 2
  },
  { 
    id: 'phase-avslut',
    key: 'avslut',
    name: 'Avslut', 
    color: '#111', 
    icon: 'checkmark-circle-outline',
    order: 3
  },
  { 
    id: 'phase-eftermarknad',
    key: 'eftermarknad',
    name: 'Eftermarknad', 
    color: '#7B1FA2', 
    icon: 'time-outline',
    order: 4
  },
  {
    id: 'phase-free',
    key: 'free',
    name: 'Valfri mappstruktur',
    color: '#F59E0B',
    icon: 'folder-open-outline',
    order: 5,
  },
];

export const DEFAULT_PHASE = 'kalkylskede';

/**
 * Hämta fas-konfiguration baserat på key
 */
export function getPhaseConfig(phaseKey) {
  return PROJECT_PHASES.find(p => p.key === phaseKey) || PROJECT_PHASES[0];
}

/**
 * Hämta fas-konfiguration baserat på projekt
 */
export function getProjectPhase(project) {
  const phaseKey = project?.phase || DEFAULT_PHASE;
  return getPhaseConfig(phaseKey);
}

/** Färg och visningsnamn per skede för left-panel header m.m. (kompakt visning). */
const PHASE_META_MAP = {
  kalkylskede: { color: '#2563EB', label: 'Kalkylskede' },
  produktion: { color: '#16A34A', label: 'Produktion' },
  avslut: { color: '#111827', label: 'Avslutat' },
  eftermarknad: { color: '#A855F7', label: 'Eftermarknad' },
  free: { color: '#F59E0B', label: 'Valfri mappstruktur' },
};

/**
 * Returnerar { color, label } för ett skede (för projekt-header i left panel).
 * @param {string} [phase] - Phase key (kalkylskede, produktion, avslut, eftermarknad)
 */
export function getPhaseMeta(phase) {
  const key = String(phase || '').trim().toLowerCase() || DEFAULT_PHASE;
  return PHASE_META_MAP[key] || PHASE_META_MAP[DEFAULT_PHASE];
}
