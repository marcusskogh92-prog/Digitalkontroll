/**
 * Filter SharePoint hierarchy based on admin navigation configuration
 * Shows all enabled sites with their folders
 */

import { getSharePointNavigationConfig, getAvailableSharePointSites } from '../components/firebase';
import { getDriveItems } from '../services/azure/hierarchyService';

/**
 * Build hierarchy from all enabled SharePoint sites
 * Each site is shown as a root-level item with its folders as children
 * @param {Array} hierarchy - Ignored (kept for compatibility, but function builds from enabled sites)
 * @param {string} companyId - Company ID
 * @param {Object} navConfig - Navigation configuration (optional, will be loaded if not provided)
 * @returns {Promise<Array>} Hierarchy with sites as root items
 */
export async function filterHierarchyByConfig(hierarchy, companyId, navConfig = null) {
  if (!companyId) {
    return [];
  }

  try {
    // Load config if not provided
    let config = navConfig;
    if (!config) {
      config = await getSharePointNavigationConfig(companyId);
    }

    const enabledSites = config?.enabledSites || [];
    const siteConfigs = config?.siteConfigs || {};

    // If no sites are enabled, return empty (admin must configure)
    if (enabledSites.length === 0) {
      return [];
    }

    // Get available sites to get site names
    let availableSites = [];
    try {
      availableSites = await getAvailableSharePointSites();
    } catch (error) {
      console.error('[filterHierarchyByConfig] Error loading available sites:', error);
    }
    
    const sitesMap = {};
    if (Array.isArray(availableSites)) {
      availableSites.forEach(site => {
        if (site && site.id) {
          sitesMap[site.id] = site;
        }
      });
    }

    // Build hierarchy with sites as root items
    const siteHierarchies = [];
    
    for (const siteId of enabledSites) {
      if (!siteId) continue;
      
      const site = sitesMap[siteId];
      const siteName = site?.name || site?.displayName || siteId;
      const siteConfig = siteConfigs[siteId] || {};
      
      try {
        // Load root folders for this site
        const rootItems = await getDriveItems(siteId, '');
        const rootFolders = (rootItems || []).filter(item => item && item.folder);
        
        // Convert to hierarchy format
        const siteFolders = rootFolders.map(folder => ({
          id: folder.id || folder.name,
          name: folder.name || '',
          type: 'folder',
          path: folder.name || '',
          siteId: siteId,
          webUrl: folder.webUrl,
          children: [], // Will be loaded on demand
          lastModified: folder.lastModifiedDateTime,
        }));
        
        // Create site as root item with folders as children
        siteHierarchies.push({
          id: `site-${siteId}`,
          name: siteName,
          type: 'site',
          siteId: siteId,
          webUrl: site?.webUrl,
          children: siteFolders,
          expanded: true,
        });
      } catch (error) {
        console.error(`[filterHierarchyByConfig] Error loading folders for site ${siteId}:`, error);
        // Add site even if folders fail to load
        siteHierarchies.push({
          id: `site-${siteId}`,
          name: siteName,
          type: 'site',
          siteId: siteId,
          webUrl: site?.webUrl,
          children: [],
          expanded: true,
          error: error?.message || 'Unknown error',
        });
      }
    }

    return siteHierarchies;
  } catch (error) {
    console.error('[filterHierarchyByConfig] Error filtering hierarchy:', error);
    // On error, return empty (admin must configure properly)
    return [];
  }
}

/**
 * Check if a folder path is in a project-enabled location
 * @param {string} folderPath - Folder path to check
 * @param {string} companyId - Company ID
 * @param {Object} navConfig - Navigation configuration (optional)
 * @returns {Promise<boolean>} True if folder is in a project-enabled location
 */
export async function isProjectEnabledLocation(folderPath, companyId, navConfig = null) {
  if (!folderPath || !companyId) {
    return false;
  }

  try {
    let config = navConfig;
    if (!config) {
      config = await getSharePointNavigationConfig(companyId);
    }

    const siteConfigs = config?.siteConfigs || {};
    const projectEnabledPaths = [];

    // Collect all project-enabled paths from all site configs
    for (const siteId in siteConfigs) {
      const siteConfig = siteConfigs[siteId];
      if (siteConfig?.projectEnabledPaths && Array.isArray(siteConfig.projectEnabledPaths)) {
        projectEnabledPaths.push(...siteConfig.projectEnabledPaths);
      }
    }

    // Check if folderPath matches any project-enabled path
    const normalizedPath = String(folderPath).trim();
    
    for (const enabledPath of projectEnabledPaths) {
      const normalizedEnabled = String(enabledPath).trim();
      
      // Exact match or folder is within enabled path
      if (normalizedPath === normalizedEnabled || normalizedPath.startsWith(normalizedEnabled + '/')) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[isProjectEnabledLocation] Error checking project-enabled location:', error);
    return false;
  }
}
