/**
 * SharePoint Adapter
 * Converts SharePoint hierarchy structure to format expected by ProjectTree
 */

/**
 * Convert SharePoint folder/file structure to ProjectTree format
 * SharePoint structure: { type: 'folder'|'file', name, path, webUrl, children: [...] }
 * ProjectTree format: { type: 'main'|'sub'|'project', id, name, children: [...] }
 * 
 * @param {Array} sharePointHierarchy - SharePoint hierarchy from getSharePointHierarchy
 * @returns {Array} ProjectTree-compatible hierarchy
 */
export function adaptSharePointToProjectTree(sharePointHierarchy) {
  if (!Array.isArray(sharePointHierarchy)) {
    return [];
  }

  return sharePointHierarchy.map((phaseFolder, phaseIndex) => {
    // Phase folder becomes the "main" folder level
    // Its children are the actual main folders (like "Entreprenad", "Byggservice")
    const mainFolders = (phaseFolder.children || [])
      .filter(item => item.type === 'folder')
      .map((mainFolder, mainIndex) => {
        // Main folder's children are sub folders (like "2026", "2027")
        const subFolders = (mainFolder.children || [])
          .filter(item => item.type === 'folder')
          .map((subFolder, subIndex) => {
            // Sub folder's children can be:
            // - More folders (nested structure or projects)
            // - Files (documents)
            // - Projects (folders with project number in name)
            const children = (subFolder.children || []).map((child, childIndex) => {
              if (child.type === 'folder') {
                // Check if folder is a project (has project number pattern in name)
                if (isProjectFolder(child)) {
                  // Treat as project
                  return adaptFolderToProject(child, `${subFolder.id}-${childIndex}`);
                } else {
                  // Nested folder - treat as another subfolder level
                  // Recursively process nested folders
                  const nestedChildren = (child.children || []).map((nestedChild, nestedIndex) => {
                    if (nestedChild.type === 'folder' && isProjectFolder(nestedChild)) {
                      return adaptFolderToProject(nestedChild, `${child.id}-${nestedIndex}`);
                    } else if (nestedChild.type === 'file') {
                      return {
                        id: nestedChild.id,
                        name: nestedChild.name,
                        type: 'file',
                        webUrl: nestedChild.webUrl,
                        downloadUrl: nestedChild.downloadUrl,
                        size: nestedChild.size,
                        mimeType: nestedChild.mimeType,
                        lastModified: nestedChild.lastModified,
                      };
                    }
                    return null;
                  }).filter(Boolean);
                  
                  return {
                    id: child.id,
                    name: child.name,
                    type: 'sub',
                    path: child.path,
                    webUrl: child.webUrl,
                    children: nestedChildren,
                    expanded: false,
                  };
                }
              } else if (child.type === 'file') {
                // File - create a file item
                return {
                  id: child.id,
                  name: child.name,
                  type: 'file',
                  webUrl: child.webUrl,
                  downloadUrl: child.downloadUrl,
                  size: child.size,
                  mimeType: child.mimeType,
                  lastModified: child.lastModified,
                };
              }
              return null;
            }).filter(Boolean);

            return {
              id: subFolder.id,
              name: subFolder.name,
              type: 'sub',
              path: subFolder.path,
              webUrl: subFolder.webUrl,
              children: children,
              expanded: false,
            };
          });

        // Also check for files directly in main folder
        const mainFolderFiles = (mainFolder.children || [])
          .filter(item => item.type === 'file')
          .map((file, fileIndex) => ({
            id: file.id,
            name: file.name,
            type: 'file',
            webUrl: file.webUrl,
            downloadUrl: file.downloadUrl,
            size: file.size,
            mimeType: file.mimeType,
            lastModified: file.lastModified,
          }));

        return {
          id: mainFolder.id,
          name: mainFolder.name,
          type: 'main',
          path: mainFolder.path,
          webUrl: mainFolder.webUrl,
          children: [...subFolders, ...mainFolderFiles],
          expanded: false,
        };
      });

    // Also check for files directly in phase folder
    const phaseFiles = (phaseFolder.children || [])
      .filter(item => item.type === 'file')
      .map((file, fileIndex) => ({
        id: file.id,
        name: file.name,
        type: 'file',
        webUrl: file.webUrl,
        downloadUrl: file.downloadUrl,
        size: file.size,
        mimeType: file.mimeType,
        lastModified: file.lastModified,
      }));

    // Return phase folder as main folder (top level)
    return {
      id: phaseFolder.id,
      name: phaseFolder.name,
      type: 'main',
      path: phaseFolder.path,
      webUrl: phaseFolder.webUrl,
      children: [...mainFolders, ...phaseFiles],
      expanded: false,
      isPhaseFolder: true, // Mark as phase folder for special handling
    };
  });
}

/**
 * Adapt a folder to a project structure
 * This is used when a folder represents a project
 * @param {Object} folder - SharePoint folder
 * @param {string} fallbackId - Fallback ID if folder doesn't have one
 * @returns {Object} Project-like structure
 */
function adaptFolderToProject(folder, fallbackId) {
  // Try to extract project number from folder name
  // Format: "825-10 Projektnamn" or "P-1001 Projektnamn"
  const projectMatch = folder.name.match(/^([A-Z]?[0-9]+(?:-[0-9]+)?)\s*(?:[-–—]\s*)?(.+)$/);
  const projectNumber = projectMatch ? projectMatch[1] : null;
  const projectName = projectMatch ? projectMatch[2] : folder.name;

  // Check if folder has subfolders - these could be project functions (mappar)
  const functionFolders = (folder.children || [])
    .filter(child => child.type === 'folder')
    .map((funcFolder, index) => {
      // Map folder name to functionType for compatibility
      const folderNameLower = funcFolder.name.toLowerCase();
      let functionType = folderNameLower.replace(/\s+/g, '-');
      
      // Map common folder names to known function types
      if (folderNameLower.includes('handling') || folderNameLower.includes('dokument')) {
        functionType = 'handlingar';
      } else if (folderNameLower.includes('ritning')) {
        functionType = 'ritningar';
      } else if (folderNameLower.includes('möte') || folderNameLower.includes('mote')) {
        functionType = 'moten';
      } else if (folderNameLower.includes('förfrågning') || folderNameLower.includes('forfragning')) {
        functionType = 'forfragningsunderlag';
      } else if (folderNameLower.includes('kma') || folderNameLower.includes('kontroll')) {
        functionType = 'kma';
      } else if (folderNameLower.includes('överblick') || folderNameLower.includes('overblick')) {
        functionType = 'overblick';
      } else if (folderNameLower.includes('felanmälan') || folderNameLower.includes('felanmalning')) {
        functionType = 'felanmalningar';
      } else if (folderNameLower.includes('service') || folderNameLower.includes('besök') || folderNameLower.includes('besok')) {
        functionType = 'servicebesok';
      } else if (folderNameLower.includes('garanti') || folderNameLower.includes('besiktning')) {
        functionType = 'garantibesiktning';
      } else if (folderNameLower.includes('ärende') || folderNameLower.includes('arende') || folderNameLower.includes('logg')) {
        functionType = 'arendelogg';
      } else if (folderNameLower.includes('mejl') || folderNameLower.includes('mail')) {
        functionType = 'mejlhistorik';
      }
      
      return {
        id: `func-${funcFolder.id}`,
        name: funcFolder.name,
        type: 'projectFunction',
        functionType: functionType,
        icon: getFunctionIcon(funcFolder.name),
        order: index + 1,
        path: funcFolder.path,
        webUrl: funcFolder.webUrl,
        sharePointPath: funcFolder.path,
      };
    });

  // Files in project folder
  const projectFiles = (folder.children || [])
    .filter(child => child.type === 'file')
    .map(file => ({
      id: file.id,
      name: file.name,
      type: 'file',
      webUrl: file.webUrl,
      downloadUrl: file.downloadUrl,
      size: file.size,
      mimeType: file.mimeType,
      lastModified: file.lastModified,
    }));

  return {
    id: projectNumber || folder.id || fallbackId,
    name: projectName || folder.name,
    type: 'project',
    path: folder.path,
    webUrl: folder.webUrl,
    // Project metadata from SharePoint folder
    status: 'ongoing', // Default status
    children: [...functionFolders, ...projectFiles], // Include function folders and files from SharePoint
    expanded: false,
  };
}

/**
 * Get icon for function folder based on name
 * @param {string} folderName - Folder name
 * @returns {string} Icon name
 */
function getFunctionIcon(folderName) {
  const name = folderName.toLowerCase();
  if (name.includes('handling') || name.includes('dokument')) return 'document-text-outline';
  if (name.includes('ritning')) return 'map-outline';
  if (name.includes('möte') || name.includes('mote')) return 'people-outline';
  if (name.includes('förfrågning') || name.includes('forfragning')) return 'folder-outline';
  if (name.includes('kma') || name.includes('kontroll')) return 'shield-checkmark-outline';
  if (name.includes('överblick') || name.includes('overblick')) return 'eye-outline';
  if (name.includes('felanmälan') || name.includes('felanmalning')) return 'alert-circle-outline';
  if (name.includes('service') || name.includes('besök') || name.includes('besok')) return 'build-outline';
  if (name.includes('garanti') || name.includes('besiktning')) return 'checkmark-circle-outline';
  if (name.includes('ärende') || name.includes('arende') || name.includes('logg')) return 'list-outline';
  if (name.includes('mejl') || name.includes('mail')) return 'mail-outline';
  return 'folder-outline';
}

/**
 * Check if a SharePoint item is a project folder
 * Projects are typically folders with project number format in name
 * @param {Object} item - SharePoint item
 * @returns {boolean}
 */
export function isProjectFolder(item) {
  if (item.type !== 'folder') return false;
  
  // Check if folder name matches project number pattern
  // Examples: "825-10", "P-1001", "2026-01"
  const projectPattern = /^[A-Z]?[0-9]+(?:-[0-9]+)?/;
  return projectPattern.test(item.name);
}

/**
 * Get function type from folder name
 * Maps SharePoint folder names to known function types
 * @param {string} folderName - Folder name
 * @returns {string} Function type
 */
export function getFunctionTypeFromFolderName(folderName) {
  if (!folderName) return 'unknown';
  
  const name = String(folderName).toLowerCase();
  if (name.includes('handling') || name.includes('dokument')) return 'handlingar';
  if (name.includes('ritning')) return 'ritningar';
  if (name.includes('möte') || name.includes('mote')) return 'moten';
  if (name.includes('förfrågning') || name.includes('forfragning')) return 'forfragningsunderlag';
  if (name.includes('kma') || name.includes('kontroll')) return 'kma';
  if (name.includes('överblick') || name.includes('overblick')) return 'overblick';
  if (name.includes('felanmälan') || name.includes('felanmalning')) return 'felanmalningar';
  if (name.includes('service') || name.includes('besök') || name.includes('besok')) return 'servicebesok';
  if (name.includes('garanti') || name.includes('besiktning')) return 'garantibesiktning';
  if (name.includes('ärende') || name.includes('arende') || name.includes('logg')) return 'arendelogg';
  if (name.includes('mejl') || name.includes('mail')) return 'mejlhistorik';
  
  return name.replace(/\s+/g, '-');
}

/**
 * Extract project metadata from SharePoint folder
 * @param {Object} folder - SharePoint folder
 * @returns {Object} Project metadata
 */
export function extractProjectMetadata(folder) {
  const projectMatch = folder.name.match(/^([A-Z]?[0-9]+(?:-[0-9]+)?)\s*(?:[-–—]\s*)?(.+)$/);
  
  return {
    projectNumber: projectMatch ? projectMatch[1] : null,
    projectName: projectMatch ? projectMatch[2] : folder.name,
    path: folder.path,
    webUrl: folder.webUrl,
  };
}
