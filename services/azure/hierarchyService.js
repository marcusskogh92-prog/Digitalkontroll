/**
 * SharePoint Hierarchy Service
 * Fetches folder and file structure from SharePoint via Microsoft Graph API
 * This is the single source of truth for all folder/project structure
 */

import { getAccessToken } from './authService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

const isFolderLikeDriveItem = (item) => {
  if (!item) return false;
  // Normal folders
  if (item.folder) return true;
  // Some SharePoint/Graph items can behave like folders (shortcuts/remote items)
  if (item.remoteItem?.folder) return true;
  // Packages (e.g., OneNote) are container-like; treat as folder for navigation
  if (item.package) return true;
  return false;
};

/**
 * Get SharePoint site ID for a company
 * @param {string} companyId - Company ID
 * @returns {Promise<string|null>} SharePoint Site ID
 */
async function getCompanySiteId(companyId) {
  if (!companyId) return null;
  
  try {
    // Dynamic import to avoid circular dependency
    const { getCompanySharePointSiteId } = await import('../../components/firebase');
    return await getCompanySharePointSiteId(companyId);
  } catch (error) {
    console.warn('[hierarchyService] Could not fetch company SharePoint Site ID:', error);
    return null;
  }
}

/**
 * Get drive items (folders and files) from SharePoint
 * @param {string} siteId - SharePoint Site ID
 * @param {string} [itemPath] - Path to item (e.g., "Kalkylskede" or "Kalkylskede/Entreprenad")
 * @returns {Promise<Array>} Array of drive items
 */
export async function getDriveItems(siteId, itemPath = '') {
  if (!siteId) {
    throw new Error('Site ID is required');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }

  try {
    // Build endpoint path
    let endpoint;
    // Normalize and check if path is empty or just slashes
    // Handle null, undefined, empty string, or whitespace-only strings
    let normalizedPath = '';
    if (itemPath && typeof itemPath === 'string') {
      normalizedPath = itemPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      // Remove any trailing slashes
      normalizedPath = normalizedPath.replace(/\/+$/, '');
      // Final check: ensure path is not empty after normalization
      if (!normalizedPath || normalizedPath.length === 0) {
        normalizedPath = '';
      }
    }
    
    // CRITICAL VALIDATION: path must be non-empty and not just slashes/whitespace
    // Also check for invalid characters that could break Graph API
    // This prevents malformed URLs like root:/::/children
    // IMPORTANT: Must return a boolean (true/false), not a string or empty value
    const isValidPath = Boolean(
      normalizedPath && 
      typeof normalizedPath === 'string' &&
      normalizedPath.length > 0 && 
      normalizedPath !== '/' && 
      !normalizedPath.match(/^[\s\/]+$/) &&
      normalizedPath.trim().length > 0
    );
    
    if (isValidPath) {
      // Get specific folder's children - use proper Graph API path format
      // Format: /sites/{site-id}/drive/root:/{path}:/children
      // Note: Graph API requires the path to NOT start with / in the root: syntax
      // CRITICAL: Double-check that normalizedPath is not empty before using it
      // Also ensure it's a valid string and not just whitespace
      const finalPath = normalizedPath && typeof normalizedPath === 'string' 
        ? normalizedPath.trim() 
        : '';
      
      if (!finalPath || finalPath.length === 0 || finalPath === '/') {
        console.error('[hierarchyService] getDriveItems - isValidPath is true but normalizedPath is empty or invalid!', {
          itemPath,
          normalizedPath,
          finalPath,
          isValidPath,
          normalizedPathType: typeof normalizedPath,
          normalizedPathLength: normalizedPath?.length || 0
        });
        endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
      } else {
        // Ensure path doesn't start with / and doesn't end with /
        const cleanPath = finalPath.replace(/^\/+/, '').replace(/\/+$/, '');
        if (!cleanPath || cleanPath.length === 0) {
          console.error('[hierarchyService] getDriveItems - Path became empty after cleaning!', {
            itemPath,
            normalizedPath,
            finalPath,
            cleanPath
          });
          endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
        } else {
          // Graph paths should be URL-encoded per segment, but keep '/' separators.
          // This prevents 404s for folders containing spaces, å/ä/ö, parentheses, etc.
          const encodedPath = cleanPath
            .split('/')
            .map((seg) => encodeURIComponent(seg))
            .join('/');
          endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:/${encodedPath}:/children`;
        }
      }
    } else {
      // Get root children - use this if path is empty, null, or invalid
      // Log warning if we received a non-empty itemPath but it normalized to empty
      if (itemPath && typeof itemPath === 'string' && itemPath.trim && itemPath.trim().length > 0) {
        console.error('[hierarchyService] getDriveItems - CRITICAL: itemPath normalized to empty!', {
          original: itemPath,
          normalized: normalizedPath,
          type: typeof itemPath,
          length: itemPath?.length
        });
      }
      endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
    }
    
    // Final safety check: ensure endpoint doesn't contain ::/children or ::/ (malformed)
    // This should never happen if validation above works, but double-check
    // Check for any double colons which indicate empty path segments
    if (endpoint.includes('::/') || endpoint.includes(':::')) {
      console.error('[hierarchyService] getDriveItems - CRITICAL: Malformed endpoint detected!', {
        endpoint,
        itemPath,
        normalizedPath,
        isValidPath,
        itemPathType: typeof itemPath,
        itemPathLength: itemPath?.length || 0,
        normalizedPathType: typeof normalizedPath,
        normalizedPathLength: normalizedPath?.length || 0
      });
      // Fallback to root children to prevent 400 error
      endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
      console.warn('[hierarchyService] getDriveItems - Using fallback root endpoint to prevent 400 error');
    }
    
    // Additional check: ensure endpoint doesn't have root:/ followed by :/ (empty path)
    // This catches cases like root:/::/03-System: or root:/::/children
    if (endpoint.match(/root:\/::/)) {
      console.error('[hierarchyService] getDriveItems - CRITICAL: Empty path detected in endpoint!', {
        endpoint,
        itemPath,
        normalizedPath,
        isValidPath
      });
      // Fallback to root children
      endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
      console.warn('[hierarchyService] getDriveItems - Using fallback root endpoint due to empty path');
    }
    
    // Log final endpoint for debugging (truncate siteId for readability)
    const logSiteId = siteId ? (siteId.length > 50 ? siteId.substring(0, 50) + '...' : siteId) : 'null';
    console.log('[hierarchyService] getDriveItems', {
      siteId: logSiteId,
      itemPath: itemPath || '(empty)',
      normalizedPath: normalizedPath || '(empty)',
      isValidPath: isValidPath === true ? 'true' : 'false', // Ensure boolean is logged as string for clarity
      isValidPathType: typeof isValidPath,
      endpoint: endpoint.replace(siteId || '', 'SITE_ID')
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Folder doesn't exist yet - return empty array
        return [];
      }
      const errorText = await response.text();
      throw new Error(`Failed to get drive items: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[hierarchyService] Error getting drive items:', error);
    throw error;
  }
}

/**
 * Get full folder hierarchy from SharePoint
 * For lazy loading: only fetches root folders by default, children loaded on demand
 * @param {string} companyId - Company ID
 * @param {string} [phaseKey] - Phase key to filter (optional, deprecated - use folder path instead)
 * @param {number} [maxDepth] - Maximum recursion depth (default: 1 for lazy loading)
 * @returns {Promise<Array>} Hierarchical structure
 */
export async function getSharePointHierarchy(companyId, phaseKey = null, maxDepth = 1) {
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    console.warn('[hierarchyService] No SharePoint site ID found for company:', companyId);
    return [];
  }

  try {
    // Get root items - ALL folders at root level
    const rootItems = await getDriveItems(siteId);
    
    // Filter for folders only
    let rootFolders = rootItems.filter(item => item.folder);

    // If phaseKey is provided, filter to that specific folder
    if (phaseKey) {
      rootFolders = rootFolders.filter(folder => 
        folder.name.toLowerCase() === phaseKey.toLowerCase()
      );
    }

    // For lazy loading: only fetch root folders, children will be loaded when expanded
    const hierarchy = await Promise.all(
      rootFolders.map(folder => buildFolderHierarchy(siteId, folder, '', maxDepth))
    );

    return hierarchy;
  } catch (error) {
    console.error('[hierarchyService] Error getting SharePoint hierarchy:', error);
    throw error;
  }
}

/**
 * Load children for a specific folder (lazy loading)
 * @param {string} companyId - Company ID
 * @param {string} folderPath - Path to folder (e.g., "Kalkylskede" or "Kalkylskede/Entreprenad")
 * @param {number} [maxDepth] - Maximum recursion depth (default: 1)
 * @returns {Promise<Array>} Array of children (folders and files)
 */
export async function loadFolderChildren(companyId, folderPath, maxDepth = 1) {
  if (!companyId) {
    console.warn('[hierarchyService] loadFolderChildren - No companyId provided');
    return [];
  }

  // Validate and normalize folderPath
  let normalizedFolderPath = '';
  if (folderPath && typeof folderPath === 'string') {
    normalizedFolderPath = folderPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
    normalizedFolderPath = normalizedFolderPath.replace(/\/+$/, '');
  }
  
  // If path is empty or invalid, we can still try to get root children
  // But log a warning
  if (!normalizedFolderPath || normalizedFolderPath.length === 0 || normalizedFolderPath === '/') {
    console.warn('[hierarchyService] loadFolderChildren - Invalid or empty folderPath:', folderPath, 'will try root');
    normalizedFolderPath = '';
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    console.warn('[hierarchyService] loadFolderChildren - No siteId found for company:', companyId);
    return [];
  }

  try {
    // Final validation before calling getDriveItems - prevent empty paths from causing ::/children errors
    // CRITICAL: Ensure we never pass an empty string that could result in ::/children
    let finalPath = normalizedFolderPath;
    if (!finalPath || finalPath.length === 0 || finalPath === '/') {
      // If path is empty/invalid, explicitly pass undefined or empty string
      // getDriveItems will handle this and use root/children endpoint
      finalPath = '';
      console.warn('[hierarchyService] loadFolderChildren - Path normalized to empty, will use root endpoint. Original:', folderPath);
    }
    
    console.log('[hierarchyService] loadFolderChildren - Calling getDriveItems', {
      siteId: siteId?.substring(0, 50) + '...',
      originalFolderPath: folderPath,
      normalizedFolderPath: normalizedFolderPath,
      finalPath: finalPath,
      finalPathType: typeof finalPath,
      finalPathLength: finalPath?.length || 0
    });
    
    const children = await getDriveItems(siteId, finalPath);
    console.log('[hierarchyService] loadFolderChildren - Successfully loaded', children.length, 'items for path:', finalPath || '(root)');
    
    // Process children - only folders for now (files can be added later if needed)
    const processedChildren = await Promise.all(
      children
        .filter((item) => isFolderLikeDriveItem(item)) // Only folders/containers for navigation
        .map(async (item) => {
          // For lazy loading, we want immediate children only
          // So we pass maxDepth=1 and currentDepth=0, which means we'll get the folder but not its children
          // Construct subfolder path safely - this is critical for lazy loading deeper levels
          let subfolderPath = '';
          if (normalizedFolderPath && normalizedFolderPath.length > 0 && normalizedFolderPath !== '/') {
            // Parent has a valid path, construct child path
            subfolderPath = `${normalizedFolderPath}/${item.name}`;
          } else {
            // Parent is root or has no path, child is at root level
            subfolderPath = item.name;
          }
          
          // Ensure path is normalized (no leading/trailing slashes except for root)
          subfolderPath = subfolderPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
          subfolderPath = subfolderPath.replace(/\/+$/, '');
          
          // Final validation - path should never be empty for a folder
          if (!subfolderPath || subfolderPath.length === 0) {
            console.warn('[hierarchyService] loadFolderChildren - Empty subfolderPath constructed, using item.name:', item.name, 'parentPath:', normalizedFolderPath);
            subfolderPath = item.name || '';
          }
          
          return {
            id: item.id,
            name: item.name,
            type: 'folder',
            webUrl: item.webUrl,
            path: subfolderPath, // Always include path for lazy loading - critical for nested folders
            children: [], // Children will be loaded when this folder is expanded
            lastModified: item.lastModifiedDateTime,
          };
        })
    );

    console.log('[hierarchyService] loadFolderChildren - returning', processedChildren.length, 'folders');
    return processedChildren;
  } catch (error) {
    console.error('[hierarchyService] Error loading folder children:', error);
    return [];
  }
}

/**
 * Check whether a folder contains any files in its subtree.
 * Depth-limited to avoid excessive Graph calls.
 *
 * Used for UI styling (bold when content exists).
 *
 * @param {string} companyId
 * @param {string} folderPath
 * @param {number} [maxDepth]
 * @returns {Promise<boolean>}
 */
export async function folderHasFilesDeep(companyId, folderPath, maxDepth = 4) {
  if (!companyId) return false;

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) return false;

  let normalizedFolderPath = '';
  if (folderPath && typeof folderPath === 'string') {
    normalizedFolderPath = folderPath.replace(/^\/+/, '').replace(/\/+/, '/').trim();
    normalizedFolderPath = normalizedFolderPath.replace(/\/+$/, '');
  }

  const visited = new Set();

  const walk = async (path, depth) => {
    const key = String(path || '').trim();
    if (depth < 0) return false;
    if (!key) return false;
    if (visited.has(key)) return false;
    visited.add(key);

    const items = await getDriveItems(siteId, key);
    if (Array.isArray(items) && items.some((it) => !!it?.file)) {
      return true;
    }

    if (depth === 0) return false;

    const folders = Array.isArray(items) ? items.filter((it) => !!it?.folder) : [];
    for (const folder of folders) {
      const childName = String(folder?.name || '').trim();
      if (!childName) continue;
      const childPath = `${key}/${childName}`.replace(/^\/+/, '').replace(/\/+/, '/').replace(/\/+$/, '');
      // eslint-disable-next-line no-await-in-loop
      const found = await walk(childPath, depth - 1);
      if (found) return true;
    }
    return false;
  };

  try {
    return await walk(normalizedFolderPath, Number.isFinite(maxDepth) ? maxDepth : 4);
  } catch (error) {
    console.warn('[hierarchyService] folderHasFilesDeep - failed, defaulting to false', error);
    return false;
  }
}

/**
 * Recursively build folder hierarchy
 * @param {string} siteId - SharePoint Site ID
 * @param {Object} folderItem - Folder item from Graph API
 * @param {string} currentPath - Current path in hierarchy
 * @param {number} maxDepth - Maximum recursion depth
 * @param {number} currentDepth - Current depth
 * @returns {Promise<Object>} Folder hierarchy object
 */
async function buildFolderHierarchy(siteId, folderItem, currentPath = '', maxDepth = 10, currentDepth = 0) {
  const folderPath = currentPath ? `${currentPath}/${folderItem.name}` : folderItem.name;
  
  if (currentDepth >= maxDepth) {
    // Return folder with path but no children (for lazy loading)
    return {
      id: folderItem.id,
      name: folderItem.name,
      type: 'folder',
      webUrl: folderItem.webUrl,
      path: folderPath, // Always include path for lazy loading
      children: [],
    };
  }
  
  try {
    // Get children of this folder
    const children = await getDriveItems(siteId, folderPath);
    
    // Process children
    const processedChildren = await Promise.all(
      children.map(async (item) => {
        if (item.folder) {
          // Recursively process subfolder
          return await buildFolderHierarchy(siteId, item, folderPath, maxDepth, currentDepth + 1);
        } else {
          // File item
          return {
            id: item.id,
            name: item.name,
            type: 'file',
            webUrl: item.webUrl,
            downloadUrl: item['@microsoft.graph.downloadUrl'],
            size: item.size,
            lastModified: item.lastModifiedDateTime,
            mimeType: item.file?.mimeType,
          };
        }
      })
    );

    return {
      id: folderItem.id,
      name: folderItem.name,
      type: 'folder',
      webUrl: folderItem.webUrl,
      path: folderPath,
      children: processedChildren,
      lastModified: folderItem.lastModifiedDateTime,
    };
  } catch (error) {
    console.warn(`[hierarchyService] Error building hierarchy for ${folderPath}:`, error);
    // Return folder without children if we can't fetch them, but always include path
    return {
      id: folderItem.id,
      name: folderItem.name,
      type: 'folder',
      webUrl: folderItem.webUrl,
      path: folderPath, // Always include path for lazy loading
      children: [],
      error: error.message,
    };
  }
}

/**
 * Get folder by path
 * @param {string} companyId - Company ID
 * @param {string} folderPath - Folder path (e.g., "Kalkylskede/Entreprenad")
 * @returns {Promise<Object|null>} Folder item or null if not found
 */
export async function getFolderByPath(companyId, folderPath) {
  if (!companyId) {
    return null;
  }
  
  // Validate folderPath - must be non-empty string
  if (!folderPath || (typeof folderPath === 'string' && folderPath.trim().length === 0)) {
    console.warn('[hierarchyService] getFolderByPath - Empty or invalid folderPath');
    return null;
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    return null;
  }

  try {
    // Normalize and validate path
    let normalizedPath = '';
    if (folderPath && typeof folderPath === 'string') {
      normalizedPath = folderPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalizedPath = normalizedPath.replace(/\/+$/, '');
    }
    
    // Validate: path must be non-empty and not just slashes
    if (!normalizedPath || normalizedPath.length === 0 || normalizedPath === '/' || normalizedPath.match(/^[\s\/]+$/)) {
      console.warn('[hierarchyService] getFolderByPath - Invalid or empty folderPath:', folderPath);
      return null;
    }
    
    const endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:/${normalizedPath}`;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get folder: ${response.status}`);
    }

    const data = await response.json();
    if (!data.folder) {
      return null; // Not a folder
    }

    return {
      id: data.id,
      name: data.name,
      type: 'folder',
      webUrl: data.webUrl,
      path: normalizedPath,
    };
  } catch (error) {
    console.error('[hierarchyService] Error getting folder by path:', error);
    return null;
  }
}

/**
 * Create folder in SharePoint
 * @param {string} companyId - Company ID
 * @param {string} parentPath - Parent folder path (empty string for root)
 * @param {string} folderName - Name of folder to create
 * @returns {Promise<Object>} Created folder item
 */
export async function createFolder(companyId, parentPath, folderName) {
  if (!companyId || !folderName) {
    throw new Error('Company ID and folder name are required');
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    throw new Error('No SharePoint site ID found for company');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token');
  }

  try {
    // Build endpoint
    let endpoint;
    if (parentPath && typeof parentPath === 'string') {
      let normalizedPath = parentPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalizedPath = normalizedPath.replace(/\/+$/, '');
      // Validate: path must be non-empty and not just slashes
      if (normalizedPath && normalizedPath.length > 0 && normalizedPath !== '/' && !normalizedPath.match(/^[\s\/]+$/)) {
        endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:/${normalizedPath}:/children`;
      } else {
        endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
      }
    } else {
      endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root/children`;
    }

    // Create folder request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create folder: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      type: 'folder',
      webUrl: data.webUrl,
      path: parentPath ? `${parentPath}/${data.name}` : data.name,
    };
  } catch (error) {
    console.error('[hierarchyService] Error creating folder:', error);
    throw error;
  }
}

/**
 * Get project folders from SharePoint
 * Finds a project folder by project number/name and returns its children (function folders)
 * @param {string} companyId - Company ID
 * @param {string} projectId - Project ID (e.g., "825-10" or "P-1001")
 * @param {string} phaseKey - Phase key (e.g., "kalkylskede", "produktion")
 * @returns {Promise<Array>} Array of folders (project functions) in the project
 */
export async function getProjectFolders(companyId, projectId, phaseKey, projectPathOverride = null) {
  if (!companyId || !projectId) {
    return [];
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    console.warn('[hierarchyService] No SharePoint site ID found for company:', companyId);
    return [];
  }

  try {
    const directProjectPath = String(projectPathOverride || '').trim();
    if (directProjectPath) {
      const projectChildren = await getDriveItems(siteId, directProjectPath);
      return projectChildren
        .filter((child) => isFolderLikeDriveItem(child))
        .map((folder) => {
          const folderNameLower = String(folder.name || '').toLowerCase();
          let functionType = folderNameLower.replace(/\s+/g, '-');

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
            functionType = 'garantier';
          }

          return {
            id: folder.id,
            name: folder.name,
            type: 'folder',
            functionType,
            webUrl: folder.webUrl,
            path: `${directProjectPath}/${folder.name}`.replace(/^\/+/, '').replace(/\/+$/, ''),
            sharePointPath: `${directProjectPath}/${folder.name}`.replace(/^\/+/, '').replace(/\/+$/, ''),
            children: [],
            lastModified: folder.lastModifiedDateTime,
          };
        });
    }

    // Map phase key to folder name
    const phaseMap = {
      'kalkylskede': 'Kalkylskede',
      'produktion': 'Produktion',
      'avslut': 'Avslut',
      'eftermarknad': 'Eftermarknad',
    };
    const phaseFolderName = phaseMap[phaseKey] || 'Kalkylskede';

    // Get phase folder children
    const phaseChildren = await getDriveItems(siteId, phaseFolderName);
    
    // Search for project folder recursively
    const findProjectFolder = async (items, currentPath = '') => {
      for (const item of items) {
        if (item.folder) {
          // Check if folder name matches project ID
          // Project folders can be named like "825-10 Projektnamn" or just "825-10"
          const folderNameMatch = item.name.match(/^([A-Z]?[0-9]+(?:-[0-9]+)?)/);
          const folderProjectId = folderNameMatch ? folderNameMatch[1] : null;
          
          if (folderProjectId === projectId || item.name === projectId) {
            // Found project folder - get its children (these are the function folders)
            const projectPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            const projectChildren = await getDriveItems(siteId, projectPath);
            
            // Return folders as project functions
            return projectChildren
              .filter((child) => isFolderLikeDriveItem(child))
              .map((folder, index) => {
                // Map folder name to functionType for compatibility
                const folderNameLower = folder.name.toLowerCase();
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
                  id: `func-${folder.id}`,
                  name: folder.name,
                  type: 'projectFunction',
                  functionType: functionType,
                  icon: getFunctionIcon(folder.name),
                  order: index + 1,
                  path: `${projectPath}/${folder.name}`,
                  webUrl: folder.webUrl,
                  // Store SharePoint path for direct navigation
                  sharePointPath: `${projectPath}/${folder.name}`,
                };
              });
          }
          
          // Recursively search in subfolders
          const subPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          const subChildren = await getDriveItems(siteId, subPath);
          const found = await findProjectFolder(subChildren, subPath);
          if (found && found.length > 0) {
            return found;
          }
        }
      }
      return [];
    };

    return await findProjectFolder(phaseChildren, phaseFolderName);
  } catch (error) {
    console.error('[hierarchyService] Error getting project folders:', error);
    return [];
  }
}

/**
 * Get icon for function folder based on name
 * @param {string} folderName - Folder name
 * @returns {string} Icon name
 */
function getFunctionIcon(folderName) {
  if (!folderName) return 'folder-outline';
  const name = String(folderName).toLowerCase();
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
 * Delete folder or file from SharePoint
 * @param {string} companyId - Company ID
 * @param {string} itemPath - Path to item to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteItem(companyId, itemPath) {
  if (!companyId || !itemPath) {
    throw new Error('Company ID and item path are required');
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    throw new Error('No SharePoint site ID found for company');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token');
  }

  try {
    // Normalize and validate path
    let normalizedPath = '';
    if (itemPath && typeof itemPath === 'string') {
      normalizedPath = itemPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalizedPath = normalizedPath.replace(/\/+$/, '');
    }
    
    // Validate: path must be non-empty and not just slashes
    if (!normalizedPath || normalizedPath.length === 0 || normalizedPath === '/' || normalizedPath.match(/^[\s\/]+$/)) {
      throw new Error('Cannot delete root folder or invalid path');
    }
    
    const endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:/${normalizedPath}`;

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Failed to delete item: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return true;
  } catch (error) {
    console.error('[hierarchyService] Error deleting item:', error);
    throw error;
  }
}

/**
 * Check if company has a connected SharePoint site and verify connection
 * @param {string} companyId - Company ID
 * @returns {Promise<{connected: boolean, siteId: string|null, siteUrl: string|null, siteName: string|null, error: string|null}>}
 */
export async function checkSharePointConnection(companyId) {
  if (!companyId) {
    return { connected: false, siteId: null, siteUrl: null, siteName: null, error: 'No company ID provided' };
  }

  try {
    const siteId = await getCompanySiteId(companyId);
    if (!siteId) {
      return { connected: false, siteId: null, siteUrl: null, siteName: null, error: 'No SharePoint site configured for this company' };
    }

    // Try to access the site to verify connection
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { connected: false, siteId, siteUrl: null, siteName: null, error: 'Failed to get access token' };
    }

    // Get site information including webUrl and displayName
    const siteEndpoint = `${GRAPH_API_BASE}/sites/${siteId}`;
    const siteResponse = await fetch(siteEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    let siteUrl = null;
    let siteName = null;
    
    if (siteResponse.ok) {
      try {
        const siteData = await siteResponse.json();
        siteUrl = siteData.webUrl || null;
        siteName = siteData.displayName || siteData.name || null;
      } catch (_e) {
        // If we can't parse site info, continue with connection check
      }
    }

    // Try to get root drive to verify site is accessible
    const endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return { 
        connected: false, 
        siteId, 
        siteUrl,
        siteName,
        error: `Cannot access SharePoint site: ${response.status} ${response.statusText}` 
      };
    }

    return { connected: true, siteId, siteUrl, siteName, error: null };
  } catch (error) {
    console.error('[hierarchyService] Error checking SharePoint connection:', error);
    return { 
      connected: false, 
      siteId: null, 
      siteUrl: null,
      siteName: null,
      error: error?.message || 'Unknown error checking SharePoint connection' 
    };
  }
}

/**
 * Create a new folder in SharePoint
 * @param {string} companyId - Company ID
 * @param {string} parentPath - Parent folder path (empty string for root)
 * @param {string} folderName - Name of the new folder
 * @returns {Promise<Object>} Created folder object
 */
export async function createSharePointFolder(companyId, parentPath, folderName) {
  if (!companyId || !folderName) {
    throw new Error('Company ID and folder name are required');
  }

  const siteId = await getCompanySiteId(companyId);
  if (!siteId) {
    throw new Error('No SharePoint site ID found for company');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token');
  }

  try {
    // Build endpoint - if parentPath is empty, create in root
    let endpoint;
    if (parentPath && typeof parentPath === 'string') {
      let normalizedPath = parentPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalizedPath = normalizedPath.replace(/\/+$/, '');
      // Validate: path must be non-empty and not just slashes
      if (normalizedPath && normalizedPath.length > 0 && normalizedPath !== '/' && !normalizedPath.match(/^[\s\/]+$/)) {
        endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:/${normalizedPath}:`;
      } else {
        endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root`;
      }
    } else {
      endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root`;
    }

    // Create folder via Graph API
    const response = await fetch(`${endpoint}/children`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create folder: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      type: 'folder',
      webUrl: data.webUrl,
      path: parentPath ? `${parentPath}/${data.name}` : data.name,
      children: [],
    };
  } catch (error) {
    console.error('[hierarchyService] Error creating SharePoint folder:', error);
    throw error;
  }
}
