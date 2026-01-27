/**
 * Determine if a SharePoint folder is a project folder (synchronous check)
 * 
 * Project folders are identified av namnmönster som tydligt ser ut
 * som projektnummer, t.ex. "2024-100 Test" eller "825-10 Opus".
 *
 * Viktigt: vi kräver nu ett projektnummer med bindestreck i början
 * (t.ex. "2024-100"), så mappar som bara heter "8 Tekniska Verken"
 * eller "12 Lejonfastigheter" inte längre tolkas som projekt utan
 * visas som vanliga mappar.
 * 
 * @param {Object} folder - SharePoint folder object
 * @returns {boolean} True if folder matches project pattern
 */
export function isProjectFolder(folder) {
  if (!folder || !folder.name) return false;
  
  const folderName = String(folder.name).trim();

  // Nytt mönster: projektnummer med minst ett bindestreck i första delen,
  // t.ex. "2024-100 Test", "825-10 Opus", "P100-01 Projekt".
  // Exkluderar namn som bara börjar med ett tal utan bindestreck
  // (t.ex. "8 Tekniska Verken").
  const projectPattern = /^([a-zA-Z]?[0-9]{2,}-[0-9]+)(?:\s+.+)?$/i;
  
  // Must have at least 2 parts (number and name)
  const parts = folderName.split(/\s+/);
  if (parts.length < 2) return false;

  // Check if matches project pattern
  return projectPattern.test(folderName);
}

/**
 * Check if a folder is a project folder AND in a project-enabled location (async)
 * @param {Object} folder - SharePoint folder object
 * @param {string} companyId - Company ID
 * @param {Object} navConfig - Navigation config (optional)
 * @returns {Promise<boolean>} True if folder is a project in enabled location
 */
export async function isProjectFolderInEnabledLocation(folder, companyId, navConfig = null) {
  if (!folder || !companyId) return false;
  
  // First check if it matches project pattern
  if (!isProjectFolder(folder)) return false;
  
  try {
    const { isProjectEnabledLocation } = await import('./filterSharePointHierarchy');
    const folderPath = folder.path || folder.name;
    const isEnabled = await isProjectEnabledLocation(folderPath, companyId, navConfig);
    
    // If project-enabled locations are configured, only return true if in enabled location
    if (!navConfig) {
      const { getSharePointNavigationConfig } = await import('../components/firebase');
      navConfig = await getSharePointNavigationConfig(companyId);
    }
    
    const hasConfig = navConfig?.siteConfigs && Object.keys(navConfig.siteConfigs).length > 0;
    if (hasConfig) {
      return isEnabled; // Only return true if in enabled location
    }
    
    return true; // Pattern matches and no strict location requirement
  } catch (error) {
    console.error('[isProjectFolderInEnabledLocation] Error:', error);
    return isProjectFolder(folder); // Fallback to pattern match
  }
}

/**
 * Extract project metadata from folder
 * @param {Object} folder - SharePoint folder object
 * @returns {Object|null} Project metadata or null if not a project
 */
export function extractProjectMetadata(folder) {
  if (!isProjectFolder(folder)) return null;
  
  const folderName = String(folder.name).trim();
  const parts = folderName.split(/\s+/);
  const projectNumber = parts[0] || '';
  
  return {
    // IMPORTANT: `id` should be the human project number used throughout the app
    // (e.g. "2026-00010"), not SharePoint's internal driveItem id.
    id: projectNumber,
    number: projectNumber,
    name: parts.slice(1).join(' ') || folderName,
    fullName: folderName,
    path: folder.path || folderName,
    sharePointId: folder?.id || null,
    folder: folder,
  };
}
