/**
 * Azure File Service - Handles file uploads/downloads via Microsoft Graph API
 * Supports SharePoint storage for all file operations
 */

import { Platform } from 'react-native';
import { getAccessToken } from './authService';
import { getAzureConfig } from './config';
// Note: getCompanySharePointSiteId is imported dynamically to avoid circular dependency

// Guard rails: DK Site (role=projects) must never contain system folders.
// System folders (company/admin structure) belong in DK Bas (role=system) only.
const SYSTEM_ROOT_FOLDERS = new Set(
  [
    'company',
    'projects',
    '01-company',
    '02-projects',
    '03-system',
    '04-shared',
    // common variants
    '01_company',
    '02_projects',
    '03_system',
    '04_shared',
  ].map((s) => String(s).toLowerCase())
);

function encodeGraphPathSegments(path) {
  const raw = String(path || '');
  if (!raw) return '';
  // Keep '/' separators intact; encode each segment so spaces/special chars are safe in URLs.
  return raw
    .split('/')
    .map((seg) => (seg === '' ? '' : encodeURIComponent(seg)))
    .join('/');
}

function normalizeRootFolderName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_');
}

function assertProjectSitePathAllowed(path, siteRole) {
  const role = String(siteRole || '').trim().toLowerCase();
  if (role !== 'projects' && role !== 'project') return;

  const parts = String(path || '')
    .split('/')
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (parts.length === 0) return;

  const root = normalizeRootFolderName(parts[0]);
  if (SYSTEM_ROOT_FOLDERS.has(root)) {
    // Intentionally hard-fail so we catch regressions early.
    // DK Site must remain a pure project site.
    throw new Error(
      `Blocked creating system folder "${parts[0]}" on project site (DK Site). System folders must live in DK Bas.`
    );
  }
}

function parseGraphErrorText(errorText) {
  const raw = String(errorText || '').trim();
  if (!raw) return { code: null, message: null, raw: '' };
  try {
    const parsed = JSON.parse(raw);
    const code = parsed?.error?.code || null;
    const message = parsed?.error?.message || null;
    return { code: code ? String(code) : null, message: message ? String(message) : null, raw };
  } catch (_e) {
    return { code: null, message: null, raw };
  }
}

function makeGraphHttpError(prefix, response, errorText) {
  const details = parseGraphErrorText(errorText);
  const status = Number(response?.status || 0) || 0;
  const statusText = String(response?.statusText || '').trim();
  const code = details.code;
  const msg = details.message;
  const err = new Error(
    `${prefix}: ${status} ${statusText}${code ? ` (${code})` : ''}${msg ? ` - ${msg}` : details.raw ? ` - ${details.raw}` : ''}`
  );
  err.status = status;
  if (code) err.code = code;
  err.graph = details;
  return err;
}

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
export async function uploadFile({
  file,
  path,
  companyId,
  siteId = null,
  phaseKey = null,
  siteRole = null,
  strictEnsure = false,
  onProgress = null,
}) {
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
  if (!sharePointSiteId && companyId && phaseKey) {
    try {
      // Dynamic import to avoid circular dependency
      const { getSharePointSiteForPhase } = await import('../../components/firebase');
      const phaseSiteConfig = await getSharePointSiteForPhase(companyId, phaseKey);
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
      await ensureFolderPath(folderPathWithoutSlash, companyId, sharePointSiteId, { siteRole, strict: !!strictEnsure });
    } catch (error) {
      if (strictEnsure) {
        const msg = String(error?.message || error || 'Unknown error');
        throw new Error(`SharePoint folder ensure failed before upload: ${msg}`);
      }
      console.warn('[uploadFile] Warning: Could not ensure folder path before upload:', error);
      // Continue with upload anyway in non-strict mode
    }
  }
  
  // For small files (< 4MB), use simple upload
  // For larger files, use upload session (resumable)
  const fileSize = file.size || 0;
  const maxSimpleUploadSize = 4 * 1024 * 1024; // 4MB
  
  if (fileSize > 0 && fileSize < maxSimpleUploadSize) {
    return await uploadFileSimple(accessToken, sharePointSiteId, normalizedPath, file, config, onProgress);
  } else {
    return await uploadFileResumable(accessToken, sharePointSiteId, normalizedPath, file, config, onProgress);
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
async function uploadFileSimple(accessToken, siteId, path, file, config, onProgress) {
  // If siteId is provided, use it directly
  // Otherwise, we need to find the site using the site URL
  let endpoint;
  const encodedPath = encodeGraphPathSegments(path);
  
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encodedPath}:`;
  } else if (config.sharePointSiteUrl) {
    // Extract site path from URL (e.g., /sites/DigitalKontroll)
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${encodedPath}:`;
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
  
  const size = Number(file?.size || 0);

  if (
    Platform.OS === 'web' &&
    typeof XMLHttpRequest !== 'undefined' &&
    typeof onProgress === 'function' &&
    (fileData instanceof Blob || fileData instanceof File)
  ) {
    try {
      onProgress({ loaded: 0, total: size });
    } catch (_e) {}

    const url = endpoint + '/content';
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': (file && file.type) ? file.type : 'application/octet-stream',
    };

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      Object.entries(headers).forEach(([k, v]) => {
        try {
          xhr.setRequestHeader(k, v);
        } catch (_e) {}
      });

      try {
        xhr.upload.onprogress = (evt) => {
          try {
            const total = evt?.total || size;
            const loaded = evt?.loaded || 0;
            onProgress({ loaded, total });
          } catch (_e) {}
        };
      } catch (_e) {}

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        const ok = xhr.status >= 200 && xhr.status < 300;

        if (!ok) {
          const errorText = xhr.responseText || '';
          reject(new Error(`File upload failed: ${xhr.status} ${xhr.statusText}${errorText ? ` - ${errorText}` : ''}`));
          return;
        }

        try {
          onProgress({ loaded: size || (xhr.responseText ? (size || 0) : 0), total: size });
        } catch (_e) {}

        try {
          const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          resolve(parsed?.webUrl || parsed?.downloadUrl || parsed?.url || '');
        } catch (e) {
          // Graph usually returns JSON; if parsing fails, still resolve.
          resolve('');
        }
      };

      xhr.onerror = () => {
        reject(new Error('File upload failed (network error).'));
      };

      xhr.send(fileData);
    });
  }

  // Upload file (fallback)
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
    throw makeGraphHttpError('File upload failed', response, errorText);
  }

  const result = await response.json();
  if (typeof onProgress === 'function' && size > 0) {
    try {
      onProgress({ loaded: size, total: size });
    } catch (_e) {}
  }
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
async function uploadFileResumable(accessToken, siteId, path, file, config, onProgress) {
  // Create upload session
  let endpoint;
  const encodedPath = encodeGraphPathSegments(path);
  
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encodedPath}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${encodedPath}:`;
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
    throw makeGraphHttpError('Failed to create upload session', sessionResponse, errorText);
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

  if (typeof onProgress === 'function' && fileSize > 0) {
    try {
      onProgress({ loaded: 0, total: fileSize });
    } catch (_e) {}
  }
  
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
      throw makeGraphHttpError('Chunk upload failed', chunkResponse, errorText);
    }
    
    // If this is the last chunk, the response will contain the file metadata
    if (chunkEnd >= fileSize) {
      const result = await chunkResponse.json();
      if (typeof onProgress === 'function' && fileSize > 0) {
        try {
          onProgress({ loaded: fileSize, total: fileSize });
        } catch (_e) {}
      }
      return result.webUrl || result.downloadUrl || result.url;
    }
    
    offset = chunkEnd;

    if (typeof onProgress === 'function' && fileSize > 0) {
      try {
        onProgress({ loaded: offset, total: fileSize });
      } catch (_e) {}
    }
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
  const encodedPath = encodeGraphPathSegments(normalizedPath);
  
  let endpoint;
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encodedPath}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${encodedPath}:`;
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
 * List folders in a SharePoint site at a given path
 * @param {string} [basePath] - Relative folder path inside the drive (e.g. "Projects" or "Projects/2026")
 * @param {string} siteId - SharePoint Site ID (required)
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
export async function listFolders(basePath = '', siteId) {
  if (!siteId) {
    throw new Error('Site ID is required to list folders');
  }

  const config = getAzureConfig();
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('Failed to get access token');
  }

  const normalizedBase = basePath
    ? '/' + basePath.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/^\/+/, '')
    : '';
  const encodedBase = normalizedBase ? encodeGraphPathSegments(normalizedBase) : '';

  let endpoint;
  if (encodedBase) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encodedBase}:/children`;
  } else {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root/children`;
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list folders: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.value) ? data.value : [];

  return items
    .filter((item) => item && item.folder)
    .map((item) => ({
      name: item.name,
      path: normalizedBase
        ? `${normalizedBase.replace(/^\/+/, '')}/${item.name}`
        : item.name,
    }));
}

function normalizeDriveRelativePath(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

function extractRelativePathFromParentReference(parentReferencePath) {
  // Example: "/drive/root:/Some/Folder"
  const raw = String(parentReferencePath || '').trim();
  const marker = ':/';
  const idx = raw.indexOf(marker);
  if (idx === -1) return '';
  const rel = raw.slice(idx + marker.length);
  return normalizeDriveRelativePath(rel);
}

/**
 * Get a drive item by path.
 * Returns null if not found (404).
 */
export async function getDriveItemByPath(path, siteId) {
  if (!siteId) throw new Error('siteId is required');
  const rel = normalizeDriveRelativePath(path);
  if (!rel) throw new Error('path is required');

  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Failed to get access token. Please authenticate first.');

  const encoded = encodeGraphPathSegments('/' + rel);
  const endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encoded}:`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get drive item: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return await response.json();
}

/**
 * Patch SharePoint list item fields for a driveItem (file or folder).
 * This is how we update SharePoint library metadata (columns) like ProjectNumber/ProjectName,
 * which can be surfaced in Office via Document Properties / Quick Parts.
 */
export async function patchDriveItemListItemFields({ siteId, itemId, fields } = {}) {
  const sid = String(siteId || '').trim();
  const iid = String(itemId || '').trim();
  const f = (fields && typeof fields === 'object') ? fields : null;
  if (!sid) throw new Error('siteId is required');
  if (!iid) throw new Error('itemId is required');
  if (!f) throw new Error('fields is required');

  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Failed to get access token. Please authenticate first.');

  const endpoint = `${config.graphApiEndpoint}/sites/${sid}/drive/items/${iid}/listItem/fields`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(f),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw makeGraphHttpError('Failed to patch listItem fields', response, errorText);
  }

  return await response.json();
}

/**
 * Convenience: patch list item fields by drive-relative path.
 */
export async function patchDriveItemListItemFieldsByPath({ siteId, path, fields } = {}) {
  const sid = String(siteId || '').trim();
  const rel = normalizeDriveRelativePath(path);
  if (!sid) throw new Error('siteId is required');
  if (!rel) throw new Error('path is required');

  const item = await getDriveItemByPath(rel, sid);
  if (!item) {
    const err = new Error('Drive item not found');
    err.status = 404;
    throw err;
  }

  return await patchDriveItemListItemFields({ siteId: sid, itemId: item.id, fields });
}

/**
 * Search drive for items matching a query.
 * Uses Microsoft Graph search on the site's default document library.
 */
export async function searchDriveItems(siteId, query) {
  if (!siteId) throw new Error('siteId is required');
  const q = String(query || '').trim();
  if (!q) return [];

  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Failed to get access token. Please authenticate first.');

  // Graph search endpoint. Returns both files and folders.
  const encodedQ = encodeURIComponent(q);
  const endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root/search(q='${encodedQ}')?$select=id,name,webUrl,folder,parentReference`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to search drive: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.value) ? data.value : [];
  return items.map((it) => {
    const parentRel = extractRelativePathFromParentReference(it?.parentReference?.path);
    const fullPath = normalizeDriveRelativePath(parentRel ? `${parentRel}/${it?.name}` : it?.name);
    return {
      id: it?.id || null,
      name: it?.name || null,
      webUrl: it?.webUrl || null,
      isFolder: !!it?.folder,
      path: fullPath || null,
    };
  });
}

function scoreProjectFolderCandidate({ name, projectNumber, projectName }) {
  const n = String(name || '').toLowerCase();
  const pn = String(projectNumber || '').trim().toLowerCase();
  const pnm = String(projectName || '').trim().toLowerCase();
  let score = 0;
  if (pn && n === pn) score += 80;
  if (pn && n.startsWith(pn)) score += 60;
  if (pn && n.includes(pn)) score += 40;
  if (pnm && n.includes(pnm)) score += 35;
  if (n.includes(' – ') || n.includes(' - ')) score += 10;
  return score;
}

/**
 * Resolve an existing project root folder path in a SharePoint site.
 * - Does NOT create anything.
 * - Returns a relative drive path (no leading '/').
 */
export async function resolveProjectRootFolderPath({ siteId, projectNumber, projectName, fullName } = {}) {
  const sid = String(siteId || '').trim();
  if (!sid) throw new Error('siteId is required');

  const pn = String(projectNumber || '').trim();
  const pnm = String(projectName || '').trim();
  const fn = String(fullName || '').trim();

  const candidates = [fn, `${pn} – ${pnm}`, `${pn} - ${pnm}`, pn]
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  // 1) Try exact folder name matches first.
  for (const cand of candidates) {
    const results = await searchDriveItems(sid, cand);
    const exact = results.find((r) => r?.isFolder && String(r?.name || '').trim().toLowerCase() === cand.toLowerCase());
    if (exact?.path) {
      const item = await getDriveItemByPath(exact.path, sid);
      if (item?.folder) return normalizeDriveRelativePath(exact.path);
    }
  }

  // 2) Search by projectNumber and pick best-scoring folder.
  if (pn) {
    const results = (await searchDriveItems(sid, pn)).filter((r) => r?.isFolder && r?.path);
    const scored = results
      .map((r) => ({ r, score: scoreProjectFolderCandidate({ name: r?.name, projectNumber: pn, projectName: pnm }) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const best = scored.find((x) => (x.score || 0) >= 40)?.r || scored[0]?.r || null;
    if (best?.path) {
      const item = await getDriveItemByPath(best.path, sid);
      if (item?.folder) return normalizeDriveRelativePath(best.path);
    }
  }

  throw new Error('Kunde inte hitta projektmappen i SharePoint.');
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
  const encodedPath = encodeGraphPathSegments(normalizedPath);
  
  let endpoint;
  if (siteId) {
    endpoint = `${config.graphApiEndpoint}/sites/${siteId}/drive/root:${encodedPath}:`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    endpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root:${encodedPath}:`;
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
  
  // eslint-disable-next-line no-console
  console.log(`[ensureFolder] Creating folder: "${path}" (siteId: ${siteId}, companyId: ${companyId})`);
  
  const config = getAzureConfig();
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    // eslint-disable-next-line no-console
    console.error('[ensureFolder] ❌ No access token available');
    throw new Error('Failed to get access token. Please authenticate first.');
  }
  
  // Get SharePoint site ID (same priority as uploadFile)
  let sharePointSiteId = siteId;
  if (!sharePointSiteId && companyId) {
    try {
      // Dynamic import to avoid circular dependency
      const { getCompanySharePointSiteId } = await import('../../components/firebase');
      sharePointSiteId = await getCompanySharePointSiteId(companyId);
      // eslint-disable-next-line no-console
      console.log(`[ensureFolder] Fetched siteId from company: ${sharePointSiteId}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[ensureFolder] Could not fetch company SharePoint Site ID:', error);
    }
  }
  if (!sharePointSiteId) {
    sharePointSiteId = config.sharePointSiteId;
    // eslint-disable-next-line no-console
    console.log(`[ensureFolder] Using config siteId: ${sharePointSiteId}`);
  }
  
  if (!sharePointSiteId) {
    // eslint-disable-next-line no-console
    console.error('[ensureFolder] ❌ No SharePoint site ID available');
    throw new Error('SharePoint Site ID required but not found');
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
  
  // Build base endpoint (without the final path segment)
  let baseEndpoint;
  if (sharePointSiteId) {
    baseEndpoint = `${config.graphApiEndpoint}/sites/${sharePointSiteId}/drive/root`;
  } else if (config.sharePointSiteUrl) {
    const url = new URL(config.sharePointSiteUrl);
    const sitePath = url.pathname;
    baseEndpoint = `${config.graphApiEndpoint}/sites/${url.hostname}:${sitePath}/drive/root`;
  } else {
    throw new Error('SharePoint Site ID or URL required');
  }
  
  // Check if folder exists
  try {
    // Construct check endpoint - construct full path in one go to avoid double colons
    // For root: root:/folderName:
    // For parent: root:/parentPath/folderName:
    const fullPath = parentPath && parentPath.length > 0
      ? `${parentPath}/${folderName}`
      : folderName;
    const encodedFullPath = encodeGraphPathSegments(fullPath);
    const checkEndpoint = `${baseEndpoint}:/${encodedFullPath}:`;
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
  
  // Create folder - construct endpoint correctly
  // For root: root/children
  // For parent: root:/parentPath:/children
  let createEndpoint;
  if (parentPath && parentPath.length > 0) {
    const encodedParent = encodeGraphPathSegments(parentPath);
    createEndpoint = `${baseEndpoint}:/${encodedParent}:/children`;
  } else {
    createEndpoint = `${baseEndpoint}/children`;
  }
  
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
    // eslint-disable-next-line no-console
    console.error(`[ensureFolder] ❌ Failed to create folder "${folderName}": ${createResponse.status} ${createResponse.statusText}`);
    // eslint-disable-next-line no-console
    console.error(`[ensureFolder] Error response: ${errorText}`);
    // eslint-disable-next-line no-console
    console.error(`[ensureFolder] Endpoint used: ${createEndpoint}`);
    throw new Error(`Failed to create folder: ${createResponse.status} ${createResponse.statusText} - ${errorText}`);
  }
  
  const result = await createResponse.json();
  // eslint-disable-next-line no-console
  console.log(`[ensureFolder] ✅ Successfully created folder "${folderName}" (id: ${result.id})`);
  return result.id;
}

/**
 * Ensure folder path exists recursively (creates all parent folders if needed)
 * @param {string} path - Full folder path (e.g., "Projects/MS Byggsystem/Entreprenad/2026")
 * @param {string} [companyId] - Company ID (optional)
 * @param {string} [siteId] - SharePoint Site ID (optional)
 * @returns {Promise<void>}
 */
export async function ensureFolderPath(path, companyId = null, siteId = null, options = null) {
  if (!path) {
    console.warn('[ensureFolderPath] Empty path provided');
    return; // Empty path, nothing to create
  }

  // Guard: never create system folders on project sites.
  try {
    assertProjectSitePathAllowed(path, options?.siteRole);
  } catch (e) {
    // Surface error to caller (we do NOT want silent creation).
    throw e;
  }
  
  const pathParts = path.split('/').filter(p => p); // Remove empty strings
  if (pathParts.length === 0) {
    console.warn('[ensureFolderPath] No path parts after filtering');
    return; // No folders to create
  }
  
  const strict = !!options?.strict;

  // eslint-disable-next-line no-console
  console.log(`[ensureFolderPath] Creating folder path: ${path} (parts: ${pathParts.length}, siteId: ${siteId}, strict: ${strict})`);
  
  // Build path incrementally: "A", "A/B", "A/B/C"
  let currentPath = '';
  for (let i = 0; i < pathParts.length; i++) {
    currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];
    try {
      // eslint-disable-next-line no-console
      console.log(`[ensureFolderPath] Creating folder step ${i + 1}/${pathParts.length}: ${currentPath}`);
      // When companyId is null, we're using Digitalkontroll site (system) for admin files
      const folderId = await ensureFolder(currentPath, companyId, siteId);
      // eslint-disable-next-line no-console
      console.log(`[ensureFolderPath] ✅ Created folder: ${currentPath} (id: ${folderId})`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[ensureFolderPath] ❌ Error creating folder ${currentPath}:`, error);
      if (strict) {
        const msg = String(error?.message || error || 'Unknown error');
        throw new Error(`SharePoint folder ensure failed at "${currentPath}": ${msg}`);
      }
    }
  }
  
  // eslint-disable-next-line no-console
  console.log(`[ensureFolderPath] ✅ Completed folder path creation: ${path}`);
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
        await ensureFolderPath(folder, null, siteId, { siteRole: 'system' });
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

  // IMPORTANT GUARD:
  // DK Site is a pure project site. Do not create or assume a Projects/ root here.
  // If you need system folders (Company/Projects/01-Company/02-Projects/etc), use DK Bas (system site).
  // Bygg bas-sökväg där projektet ska hamna:
  // - Om mainFolder/subFolder angivits använder vi dem som grund (t.ex. "Anbud" eller "Anbud/2026").
  // - Annars lägger vi projektet direkt i sitens rot.
  let basePath;
  if (mainFolder && subFolder) {
    basePath = `${mainFolder}/${subFolder}`;
  } else if (mainFolder) {
    basePath = mainFolder;
  } else {
    basePath = '';
  }

  // Slutlig sökväg: {bas}/{projectId}-{projectName} (direkt under rot eller vald bas)
  const safeBase = String(basePath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const projectFolder = `${projectId}-${projectName}`;
  const projectPath = safeBase ? `${safeBase}/${projectFolder}` : projectFolder;
  
  // Create project folder (this will create all parent folders too)
  await ensureFolderPath(projectPath, companyId, siteId, { siteRole: 'projects' });
  
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
          await ensureFolderPath(sectionFolder, companyId, siteId, { siteRole: 'projects' });
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
          await ensureFolderPath(subfolderPath, companyId, siteId, { siteRole: 'projects' });
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
        await ensureFolderPath(subfolderPath, companyId, siteId, { siteRole: 'projects' });
      } catch (error) {
        console.warn(`[ensureProjectStructure] Warning creating subfolder ${subfolderPath}:`, error);
      }
    }
  }
  
  console.log(`[ensureProjectStructure] ✅ Project structure created: ${projectPath}`);
}

/**
 * Ensure locked Kalkylskede folder structure exists inside a project root folder.
 * Creates both section folders and their fixed subfolders.
 *
 * @param {string} projectRootPath - Root folder path for the project (relative in the site's drive)
 * @param {string} companyId - Company ID
 * @param {string} siteId - SharePoint site ID (DK Site / role=projects)
 */
export async function ensureKalkylskedeProjectFolderStructure(projectRootPath, companyId, siteId, structureVersion = null) {
  const root = String(projectRootPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  if (!root) throw new Error('projectRootPath is required');
  if (!companyId) throw new Error('companyId is required');
  if (!siteId) throw new Error('siteId is required');

  let resolvedVersion = String(structureVersion || '').trim().toLowerCase() || null;
  if (!resolvedVersion) {
    try {
      const existingFolders = await listFolders(root, siteId);
      const names = (existingFolders || []).map((f) => String(f?.name || '').trim()).filter(Boolean);
      const { detectKalkylskedeStructureVersionFromSectionFolderNames, KALKYLSKEDE_STRUCTURE_VERSIONS } = await import('../../features/project-phases/phases/kalkylskede/kalkylskedeStructureDefinition');
      const detected = detectKalkylskedeStructureVersionFromSectionFolderNames(names);
      if (detected) {
        resolvedVersion = String(detected || '').trim().toLowerCase();
      } else if (names.length === 0) {
        // New/empty project root: default to the latest structure.
        resolvedVersion = String(KALKYLSKEDE_STRUCTURE_VERSIONS.V2);
      } else {
        // Unknown/legacy: prefer v1 to avoid creating new numbered folders in existing projects.
        resolvedVersion = String(KALKYLSKEDE_STRUCTURE_VERSIONS.V1);
      }
    } catch (_e) {
      // Safe fallback: v1 avoids creating new numbered folders in existing projects.
      resolvedVersion = 'v1';
    }
  }

  const { getKalkylskedeLockedRelativeFolderPaths } = await import('../../components/firebase');
  const relPaths = getKalkylskedeLockedRelativeFolderPaths(resolvedVersion);

  // Ensure section folders first, then nested item folders.
  // (The list already contains both; we keep ordering stable by sorting by depth.)
  const ordered = Array.isArray(relPaths)
    ? [...relPaths]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.split('/').length - b.split('/').length)
    : [];

  for (const rel of ordered) {
    const fullPath = `${root}/${rel}`
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/g, '/');
    await ensureFolderPath(fullPath, companyId, siteId, { siteRole: 'projects' });
  }
}

async function assertNotLockedKalkylskedePath({ projectRootPath, itemPath, action }) {
  const { isLockedKalkylskedeSharePointFolderPath } = await import('../../components/firebase');
  const locked = isLockedKalkylskedeSharePointFolderPath({ projectRootPath, itemPath });
  if (locked) {
    const what = action ? String(action) : 'Åtgärden';
    throw new Error(`${what} är inte tillåten: denna systemmapp är låst.`);
  }
}

/**
 * Guarded rename by driveItem id.
 * Caller must pass the projectRootPath so we can enforce lock rules.
 */
export async function renameDriveItemByIdGuarded({ siteId, itemId, newName, projectRootPath, itemPath }) {
  if (!siteId) throw new Error('siteId is required');
  if (!itemId) throw new Error('itemId is required');
  if (!newName) throw new Error('newName is required');

  if (projectRootPath && itemPath) {
    await assertNotLockedKalkylskedePath({ projectRootPath, itemPath, action: 'Byte av namn' });
  }

  const { renameDriveItemById } = await import('./hierarchyService');
  return await renameDriveItemById(siteId, itemId, newName);
}

/**
 * Guarded delete by driveItem id.
 */
export async function deleteDriveItemByIdGuarded({ siteId, itemId, projectRootPath, itemPath }) {
  if (!siteId) throw new Error('siteId is required');
  if (!itemId) throw new Error('itemId is required');

  if (projectRootPath && itemPath) {
    await assertNotLockedKalkylskedePath({ projectRootPath, itemPath, action: 'Radering' });
  }

  const { deleteDriveItemById } = await import('./hierarchyService');
  return await deleteDriveItemById(siteId, itemId);
}

/**
 * Guarded move by driveItem id.
 */
export async function moveDriveItemByIdGuarded({ siteId, itemId, newParentItemId, projectRootPath, itemPath }) {
  if (!siteId) throw new Error('siteId is required');
  if (!itemId) throw new Error('itemId is required');
  if (!newParentItemId) throw new Error('newParentItemId is required');

  if (projectRootPath && itemPath) {
    await assertNotLockedKalkylskedePath({ projectRootPath, itemPath, action: 'Flytt' });
  }

  const { moveDriveItemById } = await import('./hierarchyService');
  return await moveDriveItemById(siteId, itemId, newParentItemId);
}
