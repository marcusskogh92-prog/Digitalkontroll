/**
 * Azure File Service - Handles file uploads/downloads via Microsoft Graph API
 * Supports SharePoint storage for all file operations
 */

import { Platform } from 'react-native';
import { getAccessToken, getStoredAccessToken } from './authService';
import { getAzureConfig } from './config';
// Note: getCompanySharePointSiteId is imported dynamically to avoid circular dependency

/**
 * Upload file to SharePoint via Microsoft Graph API
 * @param {Object} options - Upload options
 * @param {File|Blob} options.file - File to upload
 * @param {string} options.path - SharePoint path (e.g., "Company/{companyId}/Users/{userId}/avatar.jpg")
 * @param {string} options.companyId - Company ID (for path organization)
 * @param {string} [options.siteId] - SharePoint Site ID (optional, uses default from config)
 * @param {string} [options.phaseKey] - Phase key ('kalkylskede', 'produktion', 'avslut', 'eftermarknad') - if provided, uses phase-specific SharePoint site
 * @returns {Promise<string>} File URL (webUrl from SharePoint)
 */
export async function uploadFile({ file, path, companyId, siteId = null, phaseKey = null }) {
  if (!file) throw new Error('File is required');
  if (!path) throw new Error('Path is required');
  
  const config = getAzureConfig();
  
  // Get access token
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }
  
  // Get SharePoint site ID
  // Priority: 1) Provided siteId, 2) Phase-specific siteId (if phaseKey provided), 3) Company-specific siteId from Firestore, 4) Global config
  let sharePointSiteId = siteId;
  if (!sharePointSiteId && companyId && options.phaseKey) {
    try {
      // Dynamic import to avoid circular dependency
      const { getSharePointSiteForPhase } = await import('../../components/firebase');
      const phaseSiteConfig = await getSharePointSiteForPhase(companyId, options.phaseKey);
      sharePointSiteId = phaseSiteConfig?.siteId || null;
    } catch (error) {
      console.warn('[uploadFile] Could not fetch phase-specific SharePoint Site ID:', error);
    }
  }
  if (!sharePointSiteId && companyId) {
    try {
      // Dynamic import to avoid circular dependency
      const { getCompanySharePointSiteId } = await import('../../components/firebase');
      sharePointSiteId = await getCompanySharePointSiteId(companyId);
    } catch (error) {
      console.warn('[uploadFile] Could not fetch company SharePoint Site ID:', error);
    }
  }
  if (!sharePointSiteId) {
    sharePointSiteId = config.sharePointSiteId;
  }
  if (!sharePointSiteId && !config.sharePointSiteUrl) {
    throw new Error('SharePoint Site ID or URL not configured. Please set EXPO_PUBLIC_SHAREPOINT_SITE_ID or EXPO_PUBLIC_SHAREPOINT_SITE_URL, or configure sharePointSiteId in company profile');
  }
  
  // Normalize path (ensure it starts with / and doesn't have double slashes)
  const normalizedPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
  
  // Extract folder path from file path (everything except the filename)
  const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
  
  // Ensure all folders in path exist before uploading
  if (folderPath && folderPath !== '/') {
    try {
      // Remove leading slash for ensureFolderPath
      const folderPathWithoutSlash = folderPath.replace(/^\/+/, '');
      await ensureFolderPath(folderPathWithoutSlash, companyId, sharePointSiteId);
    } catch (error) {
      console.warn('[uploadFile] Warning: Could not ensure folder path before upload:', error);
      // Continue with upload anyway - SharePoint might create folders automatically or folder might already exist
    }
  }
  
  // For small files (< 4MB), use simple upload
  // For larger files, use upload session (resumable)
  const fileSize = file.size || 0;
  const maxSimpleUploadSize = 4 * 1024 * 1024; // 4MB
  
  if (fileSize > 0 && fileSize < maxSimpleUploadSize) {
    return await uploadFileSimple(accessToken, sharePointSiteId, normalizedPath, file, config);
  } else {
    return await uploadFileResumable(accessToken, sharePointSiteId, normalizedPath, file, config);
  }
}

/**
 * Simple file upload (for files < 4MB)
 * @param {string} accessToken - Access token
 * @param {string} siteId - SharePoint Site ID
 * @param {string} path - File path in SharePoint
 * @param {File|Blob} file - File to upload
 * @param {Object} config - Azure configuration
 * @returns {Promise<string>} File URL
 */
async function uploadFileSimple(accessToken, siteId, path, file, config) {
  // If siteId is provided, use it directly
  // Otherwise, we need to find the site using the site URL
  let endpoint;
  
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${path}:`;
  } else if (config.sharePointSiteUrl) {
    // Extract site path from URL (e.g., /sites/DigitalKontroll)
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${path}:`;
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  // Convert file to ArrayBuffer or Blob
  let fileData;
  if (file instanceof File || file instanceof Blob) {
    fileData = file;
  } else if (Platform.OS === 'web' && typeof FileReader !== 'undefined') {
    // For web, read as ArrayBuffer
    fileData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  } else {
    // For React Native, use as-is
    fileData = file;
  }
  
  // Upload file
  const response = await fetch(endpoint + '/content', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: fileData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`File upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  return result.webUrl || result.downloadUrl || result.url;
}

/**
 * Resumable file upload (for files >= 4MB)
 * @param {string} accessToken - Access token
 * @param {string} siteId - SharePoint Site ID
 * @param {string} path - File path in SharePoint
 * @param {File|Blob} file - File to upload
 * @param {Object} config - Azure configuration
 * @returns {Promise<string>} File URL
 */
async function uploadFileResumable(accessToken, siteId, path, file, config) {
  // Create upload session
  let endpoint;
  
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${path}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${path}:`;
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  // Create upload session
  const sessionResponse = await fetch(endpoint + '/createUploadSession', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        name: path.split('/').pop(),
      },
    }),
  });
  
  if (!sessionResponse.ok) {
    const errorText = await sessionResponse.text();
    throw new Error(`Failed to create upload session: ${sessionResponse.status} ${sessionResponse.statusText} - ${errorText}`);
  }
  
  const session = await sessionResponse.json();
  const uploadUrl = session.uploadUrl;
  
  if (!uploadUrl) {
    throw new Error('Upload session did not return upload URL');
  }
  
  // Upload file in chunks (320KB chunks for resumable upload)
  const chunkSize = 320 * 1024; // 320KB
  const fileSize = file.size || 0;
  let offset = 0;
  
  while (offset < fileSize) {
    const chunkEnd = Math.min(offset + chunkSize, fileSize);
    const chunk = file.slice(offset, chunkEnd);
    
    const chunkResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': (chunkEnd - offset).toString(),
        'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${fileSize}`,
      },
      body: chunk,
    });
    
    if (!chunkResponse.ok) {
      const errorText = await chunkResponse.text();
      throw new Error(`Chunk upload failed: ${chunkResponse.status} ${chunkResponse.statusText} - ${errorText}`);
    }
    
    // If this is the last chunk, the response will contain the file metadata
    if (chunkEnd >= fileSize) {
      const result = await chunkResponse.json();
      return result.webUrl || result.downloadUrl || result.url;
    }
    
    offset = chunkEnd;
  }
  
  throw new Error('File upload completed but no file URL returned');
}

/**
 * Get file URL from SharePoint
 * @param {string} path - File path in SharePoint
 * @param {string} [companyId] - Company ID (optional)
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<string>} File URL
 */
export async function getFileUrl(path, companyId = null, siteId = null) {
  if (!path) throw new Error('Path is required');
  
  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }
  
  const normalizedPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
  
  let endpoint;
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${normalizedPath}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${normalizedPath}:`;
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null; // File not found
    }
    const errorText = await response.text();
    throw new Error(`Failed to get file URL: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  return result.webUrl || result.downloadUrl || result.url;
}

/**
 * Delete file from SharePoint
 * @param {string} path - File path in SharePoint
 * @param {string} [companyId] - Company ID (optional)
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFile(path, companyId = null, siteId = null) {
  if (!path) throw new Error('Path is required');
  
  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }
  
  const normalizedPath = '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
  
  let endpoint;
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${normalizedPath}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${normalizedPath}:`;
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete file: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return true;
}

/**
 * Create folder in SharePoint (if it doesn't exist)
 * @param {string} path - Folder path in SharePoint
 * @param {string} [companyId] - Company ID (optional)
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<string>} Folder ID
 */
export async function ensureFolder(path, companyId = null, siteId = null) {
  if (!path) throw new Error('Path is required');
  
  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    throw new Error('Failed to get access token. Please authenticate first.');
  }
  
  // Get SharePoint site ID (same priority as uploadFile)
  let sharePointSiteId = siteId;
  if (!sharePointSiteId && companyId) {
    try {
      // Dynamic import to avoid circular dependency
      const { getCompanySharePointSiteId } = await import('../../components/firebase');
      sharePointSiteId = await getCompanySharePointSiteId(companyId);
    } catch (error) {
      console.warn('[ensureFolder] Could not fetch company SharePoint Site ID:', error);
    }
  }
  if (!sharePointSiteId) {
    sharePointSiteId = config.sharePointSiteId;
  }
  
  // Normalize path and split into parts
  const pathParts = path.split('/').filter(p => p && p.trim().length > 0);
  if (pathParts.length === 0) {
    throw new Error('Invalid path: path must contain at least one folder name');
  }
  
  const folderName = pathParts.pop();
  if (!folderName || folderName.trim().length === 0) {
    throw new Error('Invalid path: folder name cannot be empty');
  }
  
  // Construct parent path - if no parent, use root
  // CRITICAL: parentPath must be normalized and never be just '/' or empty
  let parentPath = '';
  if (pathParts.length > 0) {
    parentPath = pathParts.join('/');
    // Normalize: remove leading/trailing slashes
    parentPath = parentPath.replace(/^\/+/, '').replace(/\/+$/, '');
  }
  
  // Build endpoint - use root/children if no parent, otherwise root:/parent:/children
  let endpoint;
  if (sharePointSiteId) {
    if (parentPath && parentPath.length > 0) {
      endpoint = `${config.graphApiEndpoint}/sites/${sharePointSiteId}/drive/root:/${parentPath}:`;
    } else {
      endpoint = `${config.graphApiEndpoint}/sites/${sharePointSiteId}/drive/root`;
    }
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    if (parentPath && parentPath.length > 0) {
      endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:/${parentPath}:`;
    } else {
      endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root`;
    }
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  // Check if folder exists
  try {
    // Construct check endpoint - check if folder exists in parent
    // For root: root:/folderName:
    // For parent: root:/parent:/folderName:
    const checkEndpoint = parentPath && parentPath.length > 0
      ? `${endpoint}:/${folderName}:`
      : `${endpoint}:/${folderName}:`;
    const checkResponse = await fetch(checkEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (checkResponse.ok) {
      const result = await checkResponse.json();
      return result.id;
    }
  } catch (error) {
    // Folder doesn't exist, create it
  }
  
  // Create folder - endpoint should already be correct (root or root:/parent:)
  // Append /children to create folder in the correct location
  const createEndpoint = parentPath && parentPath.length > 0
    ? `${endpoint}:/children`
    : `${endpoint}/children`;
  
  const createResponse = await fetch(createEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    }),
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create folder: ${createResponse.status} ${createResponse.statusText} - ${errorText}`);
  }
  
  const result = await createResponse.json();
  return result.id;
}

/**
 * Ensure folder path exists recursively (creates all parent folders if needed)
 * @param {string} path - Full folder path (e.g., "Projects/MS Byggsystem/Entreprenad/2026")
 * @param {string} [companyId] - Company ID (optional)
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<void>}
 */
export async function ensureFolderPath(path, companyId = null, siteId = null) {
  if (!path) return; // Empty path, nothing to create
  
  const pathParts = path.split('/').filter(p => p); // Remove empty strings
  if (pathParts.length === 0) return; // No folders to create
  
  // Build path incrementally: "A", "A/B", "A/B/C"
  let currentPath = '';
  for (let i = 0; i < pathParts.length; i++) {
    currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
    try {
      // When companyId is null, we're using Digitalkontroll site (system) for admin files
      await ensureFolder(currentPath, companyId, siteId);
    } catch (error) {
      // If folder creation fails, log but continue (parent might not exist yet)
      // ensureFolder will handle checking if folder exists
      console.warn(`[ensureFolderPath] Warning creating folder ${currentPath}:`, error);
      // Continue anyway, ensureFolder checks if folder exists before creating
    }
  }
}

/**
 * Ensure base folder structure exists in Digitalkontroll site (system)
 * Creates complete folder structure for the system
 * @param {string} [siteId] - SharePoint Site ID (optional, uses default from config)
 * @returns {Promise<void>}
 */
export async function ensureSystemFolderStructure(siteId = null) {
  try {
    // Check if we can authenticate first (without throwing)
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.warn('[ensureSystemFolderStructure] ⚠️ No access token available. Folders will be created on first upload.');
        return; // Exit early if we can't authenticate
      }
    } catch (authError) {
      // Authentication failed (e.g., popup blocked) - this is OK, folders will be created on first upload
      console.warn('[ensureSystemFolderStructure] ⚠️ Authentication not available:', authError?.message || authError);
      return; // Don't throw, just return - uploadFile will handle this
    }
    
    const folders = [
      // 1. Admin files (company logos, user avatars)
      '01-Company',
      
      // 2. Projects (will be created per company/project dynamically)
      '02-Projects',
      
      // 3. System templates and exports
      '03-System',
      '03-System/Templates',
      '03-System/Exports',
      '03-System/Backups',
      
      // 4. Shared resources (if needed in future)
      '04-Shared',
    ];
    
    for (const folder of folders) {
      try {
        await ensureFolderPath(folder, null, siteId);
      } catch (error) {
        // Don't log every warning - only if it's not an auth/popup error
        if (error?.message && !error.message.includes('Popup window was blocked')) {
          console.warn(`[ensureSystemFolderStructure] Warning creating folder ${folder}:`, error);
        }
        // Continue with other folders
      }
    }
    
    console.log('[ensureSystemFolderStructure] ✅ Ensured complete folder structure in Digitalkontroll site');
  } catch (error) {
    // Silently fail - folders will be created on first upload anyway
    // Don't log unless it's a real error (not popup/auth related)
    if (error?.message && !error.message.includes('Popup window was blocked') && !error.message.includes('authenticate')) {
      console.warn('[ensureSystemFolderStructure] ⚠️ Warning ensuring system folder structure:', error);
    }
  }
}

/**
 * Ensure project structure exists (creates project folder + standard subfolders)
 * @param {string} companyId - Company ID
 * @param {string} projectId - Project ID
 * @param {string} projectName - Project name
 * @param {string} [phaseKey] - Phase key (default: 'kalkylskede')
 * @param {string} [mainFolder] - Main folder name (e.g., "Entreprenad") - optional
 * @param {string} [subFolder] - Sub folder name (e.g., "2026") - optional
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<void>}
 */
export async function ensureProjectStructure(companyId, projectId, projectName, phaseKey = 'kalkylskede', mainFolder = null, subFolder = null, siteId = null) {
  if (!companyId || !projectId || !projectName) {
    throw new Error('Company ID, Project ID, and Project Name are required');
  }
  
  // Map phase key to folder name
  const phaseFolderNames = {
    'kalkylskede': 'Kalkylskede',
    'produktion': 'Produktion',
    'avslut': 'Avslut',
    'eftermarknad': 'Eftermarknad'
  };
  
  const phaseFolderName = phaseFolderNames[phaseKey] || 'Kalkylskede';
  
  // Build project folder path: Projects/{Phase}/{projectId}-{projectName}
  // If mainFolder/subFolder are provided, include them: Projects/{Phase}/{mainFolder}/{subFolder}/{projectId}-{projectName}
  let projectPath;
  if (mainFolder && subFolder) {
    projectPath = `Projects/${phaseFolderName}/${mainFolder}/${subFolder}/${projectId}-${projectName}`;
  } else {
    projectPath = `Projects/${phaseFolderName}/${projectId}-${projectName}`;
  }
  
  // Create project folder (this will create all parent folders too)
  await ensureFolderPath(projectPath, companyId, siteId);
  
  // For kalkylskede, create subfolders matching navigation structure
  if (phaseKey === 'kalkylskede') {
    try {
      const { getDefaultNavigation } = await import('../../features/project-phases/constants');
      const navigation = getDefaultNavigation('kalkylskede');
      
      // Create folders for each section
      const sectionFolders = navigation.sections.map(section => {
        // Remove "01 - ", "02 - " etc. prefixes and clean up name
        const folderName = section.name.replace(/^\d+\s*-\s*/, '').replace(/\s+/g, ' ');
        return `${projectPath}/${folderName}`;
      });
      
      for (const sectionFolder of sectionFolders) {
        try {
          await ensureFolderPath(sectionFolder, companyId, siteId);
        } catch (error) {
          console.warn(`[ensureProjectStructure] Warning creating section folder ${sectionFolder}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[ensureProjectStructure] Could not load navigation for kalkylskede structure:`, error);
      // Fallback to standard subfolders
      const standardSubfolders = ['Documents', 'Drawings', 'Meetings', 'Controls'];
      for (const subfolder of standardSubfolders) {
        const subfolderPath = `${projectPath}/${subfolder}`;
        try {
          await ensureFolderPath(subfolderPath, companyId, siteId);
        } catch (subfolderError) {
          console.warn(`[ensureProjectStructure] Warning creating subfolder ${subfolderPath}:`, subfolderError);
        }
      }
    }
  } else {
    // For other phases, create standard subfolders
    const standardSubfolders = ['Documents', 'Drawings', 'Meetings', 'Controls'];
    for (const subfolder of standardSubfolders) {
      const subfolderPath = `${projectPath}/${subfolder}`;
      try {
        await ensureFolderPath(subfolderPath, companyId, siteId);
      } catch (error) {
        console.warn(`[ensureProjectStructure] Warning creating subfolder ${subfolderPath}:`, error);
      }
    }
  }
  
  console.log(`[ensureProjectStructure] ✅ Project structure created: ${projectPath}`);
}
