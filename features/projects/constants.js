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
    color: '#616161', 
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
