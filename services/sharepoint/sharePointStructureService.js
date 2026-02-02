/**
 * SharePoint Structure Service
 * 
 * Fetches SharePoint folder/file structure live via Microsoft Graph API
 * Converts SharePoint structure to Digitalkontroll hierarchy format
 * No local duplication - always fetches on-demand
 */

import { getSharePointSiteForPhase } from '../../components/firebase';
import { getAccessToken } from '../azure/authService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

function fileExtFromName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const m = n.match(/\.([a-zA-Z0-9]+)$/);
  if (!m || !m[1]) return null;
  return String(m[1]).trim().toLowerCase();
}

function encodeGraphPathSegments(path) {
  const raw = String(path || '');
  if (!raw) return '';
  // Keep '/' separators; encode each segment so spaces/special chars are safe in URLs.
  return raw
    .split('/')
    .map((seg) => (seg === '' ? '' : encodeURIComponent(seg)))
    .join('/');
}

/**
 * Get SharePoint folder structure for a specific path
 * @param {string} siteId - SharePoint Site ID
 * @param {string} [folderPath] - Folder path (default: root '/')
 * @returns {Promise<Array>} Array of items (folders and files)
 */
export async function getSharePointFolderItems(siteId, folderPath = '/') {
  if (!siteId) {
    throw new Error('SharePoint Site ID is required');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }

  // Normalize path
  const normalizedPath = folderPath === '/' || !folderPath 
    ? '/' 
    : '/' + folderPath.replace(/^\/+|\/+$/g, '');

  const encodedPath = encodeGraphPathSegments(normalizedPath);
  const endpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:${encodedPath}:/children`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return []; // Folder doesn't exist
      }
      const errorText = await response.text();
      throw new Error(`Failed to list SharePoint items: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return (data.value || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      webUrl: item.webUrl || null,
      downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
      size: item.size || 0,
      createdDate: item.createdDateTime || null,
      lastModified: item.lastModifiedDateTime || null,
      createdBy: item.createdBy?.user?.displayName || null,
      mimeType: item.file?.mimeType || null,
      fileExtension: item.folder ? null : fileExtFromName(item.name),
      children: item.folder ? [] : undefined, // Will be populated if needed
    }));
  } catch (error) {
    console.error('[getSharePointFolderItems] Error:', error);
    throw error;
  }
}

/**
 * Get recursive SharePoint folder tree
 * @param {string} siteId - SharePoint Site ID
 * @param {string} [rootPath] - Root path (default: '/')
 * @param {number} [maxDepth] - Maximum depth to traverse (default: 10)
 * @returns {Promise<Object>} Tree structure with folders and files
 */
export async function getSharePointFolderTree(siteId, rootPath = '/', maxDepth = 10) {
  if (!siteId) {
    throw new Error('SharePoint Site ID is required');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }

  // Normalize path
  const normalizedPath = rootPath === '/' || !rootPath 
    ? '/' 
    : '/' + rootPath.replace(/^\/+|\/+$/g, '');

  // Get root folder info
  const rootEndpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:${normalizedPath}:`;
  
  try {
    const rootResponse = await fetch(rootEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!rootResponse.ok) {
      if (rootResponse.status === 404) {
        return null; // Folder doesn't exist
      }
      const errorText = await rootResponse.text();
      throw new Error(`Failed to get SharePoint root folder: ${rootResponse.status} - ${errorText}`);
    }

    const rootData = await rootResponse.json();
    
    // Recursively load children
    const rootItem = {
      id: rootData.id,
      name: rootData.name || 'Root',
      type: 'folder',
      webUrl: rootData.webUrl || null,
      children: [],
    };

    await loadSharePointChildrenRecursive(rootItem, siteId, normalizedPath, accessToken, maxDepth, 0);
    
    return rootItem;
  } catch (error) {
    console.error('[getSharePointFolderTree] Error:', error);
    throw error;
  }
}

/**
 * Recursively load SharePoint folder children
 */
async function loadSharePointChildrenRecursive(parentItem, siteId, parentPath, accessToken, maxDepth, currentDepth) {
  if (currentDepth >= maxDepth) {
    return;
  }

  try {
    const childrenEndpoint = `${GRAPH_API_BASE}/sites/${siteId}/drive/root:${parentPath}:/children`;
    const response = await fetch(childrenEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.warn(`[loadSharePointChildrenRecursive] Failed to load children for ${parentPath}: ${response.status}`);
      return;
    }

    const data = await response.json();
    const items = data.value || [];

    for (const item of items) {
      const itemPath = parentPath === '/' 
        ? `/${item.name}` 
        : `${parentPath}/${item.name}`;

      const childItem = {
        id: item.id,
        name: item.name,
        type: item.folder ? 'folder' : 'file',
        webUrl: item.webUrl || null,
        downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
        size: item.size || 0,
        createdDate: item.createdDateTime || null,
        lastModified: item.lastModifiedDateTime || null,
        createdBy: item.createdBy?.user?.displayName || null,
        mimeType: item.file?.mimeType || null,
        fileExtension: item.folder ? null : fileExtFromName(item.name),
        children: item.folder ? [] : undefined,
      };

      parentItem.children.push(childItem);

      // Recursively load subfolders
      if (item.folder && currentDepth < maxDepth - 1) {
        await loadSharePointChildrenRecursive(childItem, siteId, itemPath, accessToken, maxDepth, currentDepth + 1);
      }
    }
  } catch (error) {
    console.warn(`[loadSharePointChildrenRecursive] Error loading children for ${parentPath}:`, error);
  }
}

/**
 * Convert SharePoint structure to Digitalkontroll hierarchy format
 * Maps SharePoint folders to main/sub/project structure
 * @param {Object} sharePointTree - SharePoint folder tree
 * @param {string} phaseKey - Phase key
 * @returns {Array} Digitalkontroll hierarchy format
 */
export function convertSharePointToHierarchy(sharePointTree, phaseKey) {
  if (!sharePointTree || !sharePointTree.children) {
    return [];
  }

  const hierarchy = [];

  // SharePoint folders become main folders
  sharePointTree.children
    .filter(item => item.type === 'folder')
    .forEach((mainFolder) => {
      const mainItem = {
        id: `main-${mainFolder.id}`,
        name: mainFolder.name,
        type: 'main',
        phase: phaseKey,
        expanded: false,
        sharePointId: mainFolder.id,
        sharePointWebUrl: mainFolder.webUrl,
        children: [],
      };

      // Subfolders become sub folders
      if (mainFolder.children && Array.isArray(mainFolder.children)) {
        mainFolder.children
          .filter(item => item.type === 'folder')
          .forEach((subFolder) => {
            const subItem = {
              id: `sub-${subFolder.id}`,
              name: subFolder.name,
              type: 'sub',
              phase: phaseKey,
              expanded: false,
              sharePointId: subFolder.id,
              sharePointWebUrl: subFolder.webUrl,
              children: [],
            };

            // Project folders become projects
            if (subFolder.children && Array.isArray(subFolder.children)) {
              subFolder.children
                .filter(item => item.type === 'folder')
                .forEach((projectFolder) => {
                  // Try to extract project number and name from folder name
                  // Format: "PROJ-123 Project Name" or "123-Project Name"
                  const projectMatch = projectFolder.name.match(/^([A-Z0-9-]+)\s*(.+)?$/);
                  const projectNumber = projectMatch ? projectMatch[1] : projectFolder.name;
                  const projectName = projectMatch && projectMatch[2] 
                    ? projectMatch[2].trim() 
                    : projectFolder.name;

                  const projectItem = {
                    id: `P-${projectFolder.id}`,
                    name: projectName,
                    number: projectNumber,
                    type: 'project',
                    phase: phaseKey,
                    sharePointId: projectFolder.id,
                    sharePointWebUrl: projectFolder.webUrl,
                    sharePointPath: projectFolder.name,
                    // Mark as SharePoint-sourced
                    isSharePointSourced: true,
                    children: [],
                  };

                  subItem.children.push(projectItem);
                });
            }

            if (subItem.children.length > 0) {
              mainItem.children.push(subItem);
            }
          });
      }

      if (mainItem.children.length > 0) {
        hierarchy.push(mainItem);
      }
    });

  return hierarchy;
}

/**
 * Get SharePoint structure for a specific phase
 * @param {string} companyId - Company ID
 * @param {string} phaseKey - Phase key
 * @returns {Promise<Array>} Digitalkontroll hierarchy format
 */
export async function getSharePointStructureForPhase(companyId, phaseKey) {
  if (!companyId || !phaseKey) {
    throw new Error('Company ID and Phase Key are required');
  }

  try {
    // Get the SharePoint site for this phase
    const siteConfig = await getSharePointSiteForPhase(companyId, phaseKey);
    
    if (!siteConfig || !siteConfig.siteId) {
      throw new Error(`No SharePoint site configured for phase ${phaseKey}`);
    }

    // Get SharePoint folder tree
    const sharePointTree = await getSharePointFolderTree(siteConfig.siteId, '/');
    
    if (!sharePointTree) {
      return [];
    }

    // Convert to Digitalkontroll hierarchy format
    const hierarchy = convertSharePointToHierarchy(sharePointTree, phaseKey);
    
    return hierarchy;
  } catch (error) {
    console.error('[getSharePointStructureForPhase] Error:', error);
    throw error;
  }
}
