/**
 * Filter SharePoint hierarchy based on admin navigation configuration
 * Shows all enabled sites with their folders
 */

import { getAvailableSharePointSites, getCompanyVisibleSharePointSiteIds, getSharePointNavigationConfig, saveSharePointNavigationConfig } from '../components/firebase';
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
    // Load folder/path config from SharePoint Navigation (optional)
    let config = navConfig;
    if (!config) {
      config = await getSharePointNavigationConfig(companyId);
    }

    // Enabled sites are controlled by Firestore metadata (sharepoint_sites)
    // so visibility does not require SharePoint Navigation.
    let enabledSites = [];
    try {
      enabledSites = await getCompanyVisibleSharePointSiteIds(companyId);
    } catch (_e) {
      enabledSites = [];
    }

    // IMPORTANT: No legacy enabledSites fallback here.
    // We only show sites explicitly marked as projects via Firestore metadata.

    const siteConfigs = config?.siteConfigs || {};

    // If no sites are enabled, return empty
    if (!Array.isArray(enabledSites) || enabledSites.length === 0) {
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

    // Self-heal: never show DK Bas (system/base site) even if legacy config accidentally enables it.
    // We only exclude when we are reasonably confident (to avoid hiding unrelated sites).
    const isProbablyBaseSite = (siteId) => {
      if (!siteId) return false;
      const site = sitesMap[siteId];
      const name = String(site?.name || site?.displayName || '').toLowerCase();
      const url = String(site?.webUrl || site?.siteUrl || '').toLowerCase();

      // Strong signals: both "dk" and "bas" in name, or url contains "dk-bas"/"dkbas".
      if (name && name.includes('dk') && name.includes('bas')) return true;
      if (url.includes('dk-bas') || url.includes('dkbas')) return true;

      // Additional hint: explicit site config name containing "dk bas".
      const cfgName = String(siteConfigs?.[siteId]?.siteName || '').toLowerCase();
      if (cfgName.includes('dk bas')) return true;

      return false;
    };

    enabledSites = (enabledSites || []).filter((siteId) => !isProbablyBaseSite(siteId));

    // Build hierarchy with sites as root items
    const siteHierarchies = [];
    const invalidPathsBySite = {}; // siteId -> Set(paths) som inte längre finns i SharePoint
    
    for (const siteId of enabledSites) {
      if (!siteId) continue;
      
      const site = sitesMap[siteId];
      const siteName = site?.name || site?.displayName || siteId;
      const siteConfig = siteConfigs[siteId] || {};
      const hasExplicitSiteConfig = Object.prototype.hasOwnProperty.call(siteConfigs, siteId);
      
      try {
        // Load root folders for this site
        const rootItems = await getDriveItems(siteId, '');
        const rootFolders = (rootItems || []).filter(item => item && item.folder);

        // Convert to hierarchy format (top-level folders för vänsterpanelen)
        let siteFolders = [];

        // If adminen har markerat specifika projekt-aktiverade platser för siten,
        // visa bara dessa mappar i vänsterpanelen.
        const hasExplicitEnabledPathsArray = Array.isArray(siteConfig.projectEnabledPaths);
        const enabledPathsRaw = hasExplicitEnabledPathsArray ? siteConfig.projectEnabledPaths : [];
        const enabledPaths = enabledPathsRaw
          .map((p) => String(p || '').trim())
          .filter((p) => p.length > 0);

        if (enabledPaths.length > 0) {
          // Bygg en rot-nod per aktiverad sökväg. Detta innebär att om admin
          // t.ex. markerar "Entreprenad/2024", så visas "2024" som egen rad
          // i vänsterpanelen – inte huvudmappen "Entreprenad".

          // Hjälpkarta för att kunna plocka metadata för rotmappar (Ramavtal, Service, osv.)
          const rootByName = {};
          rootFolders.forEach((folder) => {
            const n = String(folder?.name || '').trim();
            if (n) rootByName[n] = folder;
          });

          // Cache för parent-mappningar så vi inte hämtar samma path flera gånger
          const parentCache = new Map(); // key: parentPath -> array av mappar

          const addedPaths = new Set();

          for (const rawPath of enabledPaths) {
            const normalized = String(rawPath || '')
              .replace(/^\/+/, '')
              .replace(/\/+$/, '');
            if (!normalized || addedPaths.has(normalized)) continue;

            const segments = normalized.split('/');
            const lastSegment = segments[segments.length - 1] || normalized;
            const rootSegment = segments[0];

            const rootFolder = rootByName[rootSegment];

            // Säkerställ att mappen faktiskt finns i SharePoint.
            // Om den har tagits bort ska vi inte visa den i vänsterpanelen.
            const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
            const folderName = lastSegment;

            let parentFolders;
            if (!parentPath) {
              // Rotnivå: använd redan hämtade rootFolders
              parentFolders = rootFolders;
            } else if (parentCache.has(parentPath)) {
              parentFolders = parentCache.get(parentPath);
            } else {
              try {
                const parentItems = await getDriveItems(siteId, parentPath);
                parentFolders = (parentItems || []).filter((item) => item && item.folder);
              } catch (error) {
                console.error('[filterSharePointHierarchy] Error loading parent folders for', parentPath, 'on site', siteId, error);
                parentFolders = [];
              }
              parentCache.set(parentPath, parentFolders);
            }

            const existsInSharePoint = (parentFolders || []).some((item) => {
              const name = String(item?.name || '').trim();
              return !!name && name === folderName;
            });

            const matchedFolder = (parentFolders || []).find((item) => {
              const name = String(item?.name || '').trim();
              return !!name && name === folderName;
            });

            if (!existsInSharePoint) {
              // Mappen finns inte längre i SharePoint -> hoppa över den här sökvägen
              // och markera den för städning från konfigurationen.
              if (!invalidPathsBySite[siteId]) {
                invalidPathsBySite[siteId] = new Set();
              }
              invalidPathsBySite[siteId].add(normalized);
              continue;
            }

            // NOTE: We intentionally do NOT pre-build a deep folder tree here.
            // The left panel lazy-loads children on expand, which avoids any depth limitation.
            const children = [];

            siteFolders.push({
              id: (rootFolder && segments.length === 1 ? rootFolder.id : undefined) || `${siteId}-${normalized}`,
              driveItemId: (rootFolder && segments.length === 1 ? rootFolder.id : undefined) || matchedFolder?.id || null,
              name: lastSegment,
              type: 'folder',
              path: normalized,
              siteId,
              webUrl: segments.length === 1 && rootFolder ? rootFolder.webUrl : undefined,
              children,
              childrenLoaded: false,
              lastModified: segments.length === 1 && rootFolder ? rootFolder.lastModifiedDateTime : undefined,
            });

            addedPaths.add(normalized);
          }
        } else {
          // Ingen specifik konfiguration för siten – visa alla rotmappar (utan barn)
          siteFolders = rootFolders.map(folder => ({
            id: folder.id || folder.name,
            driveItemId: folder.id || null,
            name: folder.name || '',
            type: 'folder',
            path: folder.name || '',
            siteId: siteId,
            webUrl: folder.webUrl,
            children: [],
            lastModified: folder.lastModifiedDateTime,
          }));
        }
        
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

    // Om vi hittade paths som inte längre finns i SharePoint, städa bort dem
    // från nav-konfigurationen så att databasen hålls ren.
    const siteIdsWithInvalids = Object.keys(invalidPathsBySite);
    if (siteIdsWithInvalids.length > 0 && companyId) {
      try {
        const nextSiteConfigs = { ...siteConfigs };
        let changed = false;

        for (const sid of siteIdsWithInvalids) {
          const invalidSet = invalidPathsBySite[sid];
          const currentCfg = nextSiteConfigs[sid] || {};
          const currentPathsRaw = Array.isArray(currentCfg.projectEnabledPaths)
            ? currentCfg.projectEnabledPaths
            : [];

          const filteredPaths = currentPathsRaw.filter((p) => {
            const norm = String(p || '')
              .replace(/^\/+/, '')
              .replace(/\/+$/, '');
            return norm && !invalidSet.has(norm);
          });

          if (filteredPaths.length !== currentPathsRaw.length) {
            nextSiteConfigs[sid] = {
              ...currentCfg,
              projectEnabledPaths: filteredPaths,
            };
            changed = true;
          }
        }

        if (changed) {
          await saveSharePointNavigationConfig(companyId, {
            ...(config || {}),
            enabledSites,
            siteConfigs: nextSiteConfigs,
          });
        }
      } catch (cleanupError) {
        console.error('[filterSharePointHierarchy] Error cleaning up invalid projectEnabledPaths:', cleanupError);
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
