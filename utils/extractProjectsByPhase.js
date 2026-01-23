/**
 * Extract projects from SharePoint hierarchy and group them by phase
 * Projects are identified as folders that match a pattern (e.g., "{number} {name}")
 * or are located in specific phase folders
 */

import { PROJECT_PHASES, DEFAULT_PHASE } from '../features/projects/constants';

/**
 * Check if a folder name matches project pattern
 * Projects typically have format like "226-01 Opus" or "{number} {name}"
 * Also matches patterns like "ddd dd", "2222 2222" (any alphanumeric + space + text)
 */
function isProjectFolder(folderName, parentPath = '') {
  if (!folderName || typeof folderName !== 'string') return false;
  
  const trimmed = folderName.trim();
  
  // Skip phase folders (they contain projects, but aren't projects themselves)
  const phaseFolderPattern = /^(0[1-4]|01|02|03|04)\s*-\s*(Kalkylskede|Produktion|Avslut|Eftermarknad)/i;
  if (phaseFolderPattern.test(trimmed)) return false;
  
  // Pattern 1: starts with number(s) followed by space/dash and text
  // Examples: "226-01 Opus", "123 Test Project"
  const numericPattern = /^\d+[\s-]+\S+/;
  if (numericPattern.test(trimmed)) return true;
  
  // Pattern 2: alphanumeric text with space and more text (common project patterns)
  // Examples: "ddd dd", "2222 2222", "Test Project"
  // This catches projects that don't start with numbers
  const textPattern = /^[a-zA-Z0-9åäöÅÄÖ]+[\s-]+[a-zA-Z0-9åäöÅÄÖ\s-]+$/i;
  if (textPattern.test(trimmed) && trimmed.split(/\s+/).length >= 2) {
    return true;
  }
  
  return false;
}

/**
 * Determine phase from folder path or name
 * Looks for phase folder names in path
 */
function getPhaseFromPath(folder, path = '') {
  // Check if folder name matches phase folder pattern
  const phaseFolderPattern = /^(0[1-4]|01|02|03|04)\s*-\s*(Kalkylskede|Produktion|Avslut|Eftermarknad)/i;
  const match = folder.name?.match(phaseFolderPattern);
  
  if (match) {
    const phaseName = match[2].toLowerCase();
    if (phaseName === 'kalkylskede') return 'kalkylskede';
    if (phaseName === 'produktion') return 'produktion';
    if (phaseName === 'avslut') return 'avslut';
    if (phaseName === 'eftermarknad') return 'eftermarknad';
  }
  
  // Check path for phase indicators
  const fullPath = path ? `${path}/${folder.name}` : folder.name;
  if (fullPath.toLowerCase().includes('kalkylskede')) return 'kalkylskede';
  if (fullPath.toLowerCase().includes('produktion')) return 'produktion';
  if (fullPath.toLowerCase().includes('avslut')) return 'avslut';
  if (fullPath.toLowerCase().includes('eftermarknad')) return 'eftermarknad';
  
  return null;
}

/**
 * Recursively extract projects from hierarchy
 * @param {Array} hierarchy - SharePoint folder hierarchy
 * @param {string} currentPath - Current path in hierarchy
 * @param {string} currentPhase - Current phase (from parent phase folder)
 * @returns {Array} Array of projects with phase information
 */
export function extractProjectsByPhase(hierarchy, currentPath = '', currentPhase = null) {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return [];
  }

  const projects = [];

  for (const folder of hierarchy) {
    if (!folder || !folder.name) continue;

    // Determine phase for this folder
    let folderPhase = currentPhase;
    const detectedPhase = getPhaseFromPath(folder, currentPath);
    if (detectedPhase) {
      folderPhase = detectedPhase;
    }

    // Check if this folder is a project
    // Projects are folders that match the pattern AND are not phase folders
    const isProject = isProjectFolder(folder.name, currentPath);
    
    if (isProject) {
      // Extract project number and name
      const parts = folder.name.trim().split(/\s+/);
      const projectNumber = parts[0] || '';
      const projectName = parts.slice(1).join(' ') || folder.name;

      projects.push({
        id: folder.id || folder.name,
        name: projectName,
        number: projectNumber,
        fullName: folder.name,
        phase: folderPhase || DEFAULT_PHASE,
        path: currentPath ? `${currentPath}/${folder.name}` : folder.name,
        folder: folder, // Keep reference to original folder
      });
      
      // Don't recurse into projects - they are treated as leaf nodes in the sidebar
      // (their contents will be shown inside the project view)
      continue;
    }

    // Recursively check children (only for non-project folders)
    if (folder.children && Array.isArray(folder.children) && folder.children.length > 0) {
      const childPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
      const childProjects = extractProjectsByPhase(folder.children, childPath, folderPhase || currentPhase);
      projects.push(...childProjects);
    }
  }

  return projects;
}

/**
 * Group projects by phase
 * @param {Array} projects - Array of projects from extractProjectsByPhase
 * @returns {Object} Object with phase keys and project arrays
 */
export function groupProjectsByPhase(projects) {
  const grouped = {
    kalkylskede: [],
    produktion: [],
    avslut: [],
    eftermarknad: [],
    unknown: [], // Projects without a clear phase
  };

  for (const project of projects) {
    const phase = project.phase || DEFAULT_PHASE;
    if (grouped[phase]) {
      grouped[phase].push(project);
    } else {
      grouped.unknown.push(project);
    }
  }

  // Sort projects within each phase by name
  Object.keys(grouped).forEach(phase => {
    grouped[phase].sort((a, b) => {
      const nameA = (a.fullName || a.name || '').toLowerCase();
      const nameB = (b.fullName || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  });

  return grouped;
}
