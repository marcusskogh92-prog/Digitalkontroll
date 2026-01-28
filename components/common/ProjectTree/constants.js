/**
 * Constants for ProjectTree component
 */

import { DEFAULT_PHASE } from '../../../features/projects/constants';

// Standardfunktioner för projekt (Kalkylskede, Produktion, Avslut)
export const DEFAULT_PROJECT_FUNCTIONS = [
  { 
    id: 'func-handlingar', 
    name: 'Handlingar', 
    type: 'projectFunction',
    functionType: 'handlingar',
    icon: 'document-text-outline',
    order: 1
  },
  { 
    id: 'func-ritningar', 
    name: 'Ritningar', 
    type: 'projectFunction',
    functionType: 'ritningar',
    icon: 'map-outline',
    order: 2
  },
  { 
    id: 'func-moten', 
    name: 'Möten', 
    type: 'projectFunction',
    functionType: 'moten',
    icon: 'people-outline',
    order: 3
  },
  { 
    id: 'func-forfragningsunderlag', 
    name: 'Förfrågningsunderlag', 
    type: 'projectFunction',
    functionType: 'forfragningsunderlag',
    icon: 'folder-outline',
    order: 4
  },
  { 
    id: 'func-kma', 
    name: 'KMA', 
    type: 'projectFunction',
    functionType: 'kma',
    icon: 'shield-checkmark-outline',
    order: 5
  }
];

// Funktioner för Eftermarknad
export const EFTERMARKNAD_PROJECT_FUNCTIONS = [
  { 
    id: 'func-overblick', 
    name: 'Överblick', 
    type: 'projectFunction',
    functionType: 'overblick',
    icon: 'eye-outline',
    order: 1
  },
  { 
    id: 'func-felanmalningar', 
    name: 'Felanmälningar', 
    type: 'projectFunction',
    functionType: 'felanmalningar',
    icon: 'alert-circle-outline',
    order: 2
  },
  { 
    id: 'func-servicebesok', 
    name: 'Servicebesök', 
    type: 'projectFunction',
    functionType: 'servicebesok',
    icon: 'build-outline',
    order: 3
  },
  { 
    id: 'func-garantibesiktning', 
    name: 'Garantibesiktning', 
    type: 'projectFunction',
    functionType: 'garantibesiktning',
    icon: 'checkmark-circle-outline',
    order: 4
  },
  { 
    id: 'func-arendelogg', 
    name: 'Ärendelogg', 
    type: 'projectFunction',
    functionType: 'arendelogg',
    icon: 'list-outline',
    order: 5
  },
  { 
    id: 'func-ritningar-och-dokument', 
    name: 'Ritningar och dokument', 
    type: 'projectFunction',
    functionType: 'ritningar-och-dokument',
    icon: 'document-text-outline',
    order: 6
  },
  { 
    id: 'func-mejlhistorik', 
    name: 'Mejlhistorik', 
    type: 'projectFunction',
    functionType: 'mejlhistorik',
    icon: 'mail-outline',
    order: 7
  }
];

/**
 * Get project functions based on phase
 */
export function getProjectFunctionsForPhase(phaseKey) {
  if (phaseKey === 'eftermarknad') {
    return EFTERMARKNAD_PROJECT_FUNCTIONS;
  }
  return DEFAULT_PROJECT_FUNCTIONS;
}

/**
 * Ensure project has default functions based on its phase
 * Uppdaterar funktionerna om projektets fas har ändrats
 * NOTE: Kalkylskede-projekt ska INTE ha funktioner - de navigerar istället
 */
export function ensureProjectFunctions(project) {
  if (!project || project.type !== 'project') return project;
  
  // Kalkylskede-projekt ska INTE ha funktioner - de använder KalkylskedeLayout istället
  const phaseKey = project?.phase || DEFAULT_PHASE;
  if (phaseKey === 'kalkylskede') {
    // Ta bort alla funktioner från kalkylskede-projekt
    const nonFunctionChildren = (project.children || []).filter(c => c.type !== 'projectFunction');
    return {
      ...project,
      expanded: false, // Kalkylskede-projekt ska aldrig expanderas
      children: nonFunctionChildren
    };
  }
  
  // Hämta rätt funktioner baserat på projektets fas
  const expectedFunctions = getProjectFunctionsForPhase(phaseKey);
  
  // Om projektet redan har children, kontrollera om det finns funktioner
  if (Array.isArray(project.children) && project.children.length > 0) {
    const hasFunctions = project.children.some(c => c.type === 'projectFunction');
    if (hasFunctions) {
      // Kontrollera om funktionerna matchar projektets fas
      const existingFunctions = project.children.filter(c => c.type === 'projectFunction');
      const expectedFunctionIds = expectedFunctions.map(f => f.id);
      const existingFunctionIds = existingFunctions.map(f => f.id);
      
      // Om funktionerna matchar, returnera projektet som det är
      const functionsMatch = expectedFunctionIds.length === existingFunctionIds.length &&
        expectedFunctionIds.every(id => existingFunctionIds.includes(id));
      
      if (functionsMatch) {
        return project;
      }
      
      // Om funktionerna inte matchar, uppdatera dem
      const nonFunctionChildren = project.children.filter(c => c.type !== 'projectFunction');
      return {
        ...project,
        expanded: project.expanded || false,
        children: [...expectedFunctions, ...nonFunctionChildren]
      };
    }
  }
  
  // Lägg till fas-specifika funktioner
  const nonFunctionChildren = (project.children || []).filter(c => c.type !== 'projectFunction');
  return {
    ...project,
    expanded: project.expanded || false,
    children: [...expectedFunctions, ...nonFunctionChildren]
  };
}
