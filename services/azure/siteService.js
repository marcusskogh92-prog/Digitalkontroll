/**
 * SharePoint Site Management Service
 * Handles creation and configuration of SharePoint sites per company
 */

import { getAccessToken } from './authService';
import { getAzureConfig } from './config';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Create a new SharePoint site for a company
 * @param {string} companyId - Company ID (used as site name identifier)
 * @param {string} companyName - Company name (for site display name)
 * @returns {Promise<{siteId: string, webUrl: string}>}
 */
export async function createCompanySite(companyId, companyName) {
  if (!companyId || !companyName) {
    throw new Error('Company ID and Company Name are required');
  }

  const config = getAzureConfig();
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }

  // Sanitize company ID for use in site URL (remove special characters, spaces, etc.)
  const sanitizedCompanyId = companyId
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 50); // Limit length

  // Extract hostname from existing SharePoint site URL
  const hostname = new URL(config.sharePointSiteUrl).hostname;
  const siteUrl = sanitizedCompanyId.toLowerCase();

  // Create site request body for Microsoft Graph API
  // POST /sites - Creates a SharePoint site collection
  // Note: Site creation is typically only available in BETA endpoint
  // Reference: https://learn.microsoft.com/en-us/graph/api/site-post?view=graph-rest-beta
  // For delegated auth, we need ownerIdentityToResolve
  const siteRequest = {
    displayName: companyName,
    description: `SharePoint site for ${companyName} - DigitalKontroll`,
    siteCollection: {
      hostname: hostname, // e.g., "msbyggsystem.sharepoint.com"
    },
    template: 'teamSite', // Modern team site (not 'sts')
    // For delegated auth, specify owner
    ownerIdentityToResolve: {
      email: 'marcus@msbyggsystem.se', // Owner email
    },
  };

  try {
    // Create site via Microsoft Graph API BETA endpoint
    // Site creation is typically only available in /beta, not /v1.0
    // POST /beta/sites - Creates a new site collection
    console.log('[siteService] Creating site with request:', JSON.stringify(siteRequest, null, 2));
    const response = await fetch(`https://graph.microsoft.com/beta/sites`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(siteRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[siteService] Failed to create site:', response.status, errorText);
      
      // If site already exists (409), try to get existing site by URL
      if (response.status === 409 || response.status === 400) {
        console.log('[siteService] Site might already exist or URL conflict, attempting to get site by URL...');
        try {
          const existingSite = await getSiteByUrl(siteUrl, hostname);
          if (existingSite) {
            console.log('[siteService] ✅ Found existing site:', existingSite.webUrl);
            return existingSite;
          }
        } catch (getError) {
          console.error('[siteService] Could not get existing site:', getError);
        }
      }
      
      throw new Error(`Failed to create SharePoint site: ${response.status} - ${errorText}`);
    }

    const siteData = await response.json();
    
    console.log(`[siteService] ✅ SharePoint site created: ${siteData.webUrl}`);
    
    return {
      siteId: siteData.id,
      webUrl: siteData.webUrl,
    };
  } catch (error) {
    console.error('[siteService] Error creating SharePoint site:', error);
    throw error;
  }
}

/**
 * Get existing site by URL
 * @param {string} siteUrl - Site URL (e.g., "DigitalKontroll" or "MSByggsystem" or "testazuresharepoint")
 * @param {string} [hostname] - SharePoint hostname (optional, will be extracted from config if not provided)
 * @returns {Promise<{siteId: string, webUrl: string}|null>}
 */
export async function getSiteByUrl(siteUrl, hostname = null) {
  const config = getAzureConfig();
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('Failed to get access token');
  }

  try {
    if (!hostname) {
      hostname = new URL(config.sharePointSiteUrl).hostname;
    }
    const sitePath = `/sites/${siteUrl}`;
    
    const response = await fetch(`${GRAPH_API_BASE}/sites/${hostname}:${sitePath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const siteData = await response.json();
      return {
        siteId: siteData.id,
        webUrl: siteData.webUrl,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[siteService] Error getting site by URL:', error);
    return null;
  }
}

/**
 * Ensure standard folder structure exists in company site
 * Creates: Company/ and Projects/ folders
 * @param {string} siteId - SharePoint site ID
 * @param {string} companyId - Company ID (for path organization)
 * @returns {Promise<void>}
 */
export async function ensureCompanySiteStructure(siteId, companyId) {
  if (!siteId || !companyId) {
    throw new Error('Site ID and Company ID are required');
  }

  try {
    // Import ensureFolder directly to avoid circular dependency
    const { ensureFolder } = await import('./fileService');
    
    // Create Company/ folder structure
    const companyFolders = [
      'Company',
      `Company/${companyId}`,
      `Company/${companyId}/Logos`,
      `Company/${companyId}/Users`,
    ];
    
    for (const folderPath of companyFolders) {
      try {
        await ensureFolder(folderPath, companyId, siteId);
      } catch (folderError) {
        console.warn(`[siteService] Could not create folder ${folderPath}:`, folderError);
      }
    }
    
    // Create Phase-based Projects folder structure
    // Each phase gets its own folder
    const phases = [
      { key: 'kalkylskede', name: 'Kalkylskede' },
      { key: 'produktion', name: 'Produktion' },
      { key: 'avslut', name: 'Avslut' },
      { key: 'eftermarknad', name: 'Eftermarknad' }
    ];
    
    const projectFolders = ['Projects'];
    
    for (const phase of phases) {
      // Projects/{Phase}/ folder
      projectFolders.push(`Projects/${phase.name}`);
    }
    
    for (const folderPath of projectFolders) {
      try {
        await ensureFolder(folderPath, companyId, siteId);
      } catch (folderError) {
        console.warn(`[siteService] Could not create folder ${folderPath}:`, folderError);
      }
    }
    
    console.log(`[siteService] ✅ Phase-based folder structure created for company: ${companyId}`);
  } catch (error) {
    console.error('[siteService] Error creating company site structure:', error);
    // Don't throw - structure creation is not critical, can be created later
    console.warn('[siteService] Company site structure will be created on-demand when files are uploaded');
  }
}

/**
 * Create company site with standard structure (convenience function)
 * @param {string} companyId - Company ID
 * @param {string} companyName - Company name
 * @returns {Promise<{siteId: string, webUrl: string}>}
 */
export async function createCompanySiteWithStructure(companyId, companyName) {
  // Create site
  const site = await createCompanySite(companyId, companyName);
  
  // Create standard structure
  await ensureCompanySiteStructure(site.siteId, companyId);
  
  return site;
}
