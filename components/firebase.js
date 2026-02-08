
// components/firebase.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, getDocsFromServer, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Alert, Platform } from 'react-native';
import { buildKalkylskedeLockedStructure, KALKYLSKEDE_STRUCTURE_VERSIONS } from '../features/project-phases/phases/kalkylskede/kalkylskedeStructureDefinition';
import { uploadFile as uploadFileToAzure } from '../services/azure/fileService';

// Firebase-konfiguration för DigitalKontroll
const firebaseConfig = {
  apiKey: "AIzaSyDI7SzOdfwV6wx0Igs8-Kdb8Zhuxwm7BWk",
  authDomain: "digitalkontroll-8fd05.firebaseapp.com",
  projectId: "digitalkontroll-8fd05",
  storageBucket: "digitalkontroll-8fd05.firebasestorage.app",
  messagingSenderId: "753073457092",
  appId: "1:753073457092:web:937d55d391cbe78be40691",
  measurementId: "G-EF1JRB9Y2E"
};

// Initiera Firebase
const app = initializeApp(firebaseConfig);

// Storage (for branding assets like company logos)
export const storage = getStorage(app);

// Initiera autentisering & Firestore
// Webb: använd standard getAuth. Native: använd initializeAuth med AsyncStorage-persistens
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}
export { auth };
export const db = getFirestore(app);
export const functionsClient = getFunctions(app, 'us-central1');

// Callable wrappers (must be invoked via httpsCallable)
export const deleteProjectCallable = httpsCallable(functionsClient, 'deleteProject');
export const deleteFolderCallable = httpsCallable(functionsClient, 'deleteFolder');

// Callable wrappers
export async function createUserRemote({ companyId, email, displayName, role, password, firstName, lastName, avatarPreset }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'createUser');
  const payload = { companyId, email, displayName };
  if (role !== undefined) payload.role = role;
  if (password !== undefined) payload.password = password;
  if (firstName !== undefined) payload.firstName = firstName;
  if (lastName !== undefined) payload.lastName = lastName;
  if (avatarPreset !== undefined) payload.avatarPreset = avatarPreset;
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

export async function deleteUserRemote({ companyId, uid }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'deleteUser');
  const res = await fn({ companyId, uid });
  return res && res.data ? res.data : res;
}

export async function updateUserRemote({ companyId, uid, displayName, email, role, password, disabled, photoURL, avatarPreset }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'updateUser');
  const payload = { companyId, uid };
  if (displayName !== undefined) payload.displayName = displayName;
  if (email !== undefined) payload.email = email;
  if (role !== undefined) payload.role = role;
  if (password !== undefined) payload.password = password;
  if (disabled !== undefined) payload.disabled = disabled;
  if (photoURL !== undefined) payload.photoURL = photoURL;
  if (avatarPreset !== undefined) payload.avatarPreset = avatarPreset;
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

// Callable wrapper: AI FFU analysis
// Signature intentionally minimal: (companyId, projectId, files)
export async function analyzeFFURemote(companyId, projectId, files) {
  if (!functionsClient) throw new Error('Functions client not initialized');

  const cid = companyId != null ? String(companyId).trim() : '';
  const pid = projectId != null ? String(projectId).trim() : '';
  if (!cid) throw new Error('analyzeFFU: companyId is required');
  if (!pid) throw new Error('analyzeFFU: projectId is required');

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('analyzeFFU: files must be a non-empty array');
  }

  const allowedTypes = new Set(['pdf', 'docx', 'xlsx', 'txt']);
  const normalizedFiles = files.map((f, idx) => {
    const id = f && f.id != null ? String(f.id).trim() : '';
    const name = f && f.name != null ? String(f.name).trim() : '';
    const type = f && f.type != null ? String(f.type).trim() : '';
    const extractedText = f && f.extractedText != null ? String(f.extractedText) : '';

    if (!id) throw new Error(`analyzeFFU: files[${idx}].id is required`);
    if (!name) throw new Error(`analyzeFFU: files[${idx}].name is required`);
    if (!type) throw new Error(`analyzeFFU: files[${idx}].type is required`);
    if (!allowedTypes.has(type)) throw new Error(`analyzeFFU: files[${idx}].type must be one of pdf|docx|xlsx|txt`);

    return { id, name, type, extractedText };
  });

  const hasAnyText = normalizedFiles.some((f) => String(f.extractedText || '').trim().length > 0);
  if (!hasAnyText) {
    throw new Error('analyzeFFU: no extractedText found in any file');
  }

  try {
    const fn = httpsCallable(functionsClient, 'analyzeFFU');
    const res = await fn({ companyId: cid, projectId: pid, files: normalizedFiles });
    const payload = (res && res.data !== undefined) ? res.data : res;

    // Support both plain schema return and a future envelope { data, fromCache }.
    if (payload && typeof payload === 'object' && payload.data && Object.prototype.hasOwnProperty.call(payload, 'fromCache')) {
      return { data: payload.data, fromCache: !!payload.fromCache };
    }
    return { data: payload, fromCache: false };
  } catch (e) {
    const code = e && typeof e.code === 'string' ? e.code : null;
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    const details = e && e.details != null ? e.details : null;

    const codeClean = code ? String(code).replace(/^functions\//, '') : null;
    const detailStr = details != null
      ? (typeof details === 'string' ? details : (() => { try { return JSON.stringify(details); } catch (_err) { return String(details); } })())
      : '';

    const parts = ['analyzeFFU failed'];
    if (codeClean) parts.push(`code=${codeClean}`);
    if (msg) parts.push(`message=${msg}`);
    if (detailStr) parts.push(`details=${detailStr}`);
    throw new Error(parts.join(' | '));
  }
}

export async function uploadUserAvatar({ companyId, uid, file }) {
  if (!companyId) throw new Error('companyId is required');
  if (!uid) throw new Error('uid is required');
  if (!file) throw new Error('file is required');
  
  const safeName = String(file?.name || 'avatar').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fileName = `${Date.now()}_${safeName}`;
  const azurePath = `01-Company/${companyId}/Users/${uid}/${fileName}`;
  
  try {
    // IMPORTANT GUARD:
    // DK Site (role=projects) must remain a pure project site.
    // System folders like 01-Company/02-Projects must live in DK Bas (role=system).
    const systemSiteId = await getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: true });

    // Ensure system folder structure exists (best-effort; may require auth)
    const { ensureSystemFolderStructure } = await import('../services/azure/fileService');
    await ensureSystemFolderStructure(systemSiteId || null);

    const url = await uploadFileToAzure({
      file,
      path: azurePath,
      companyId, // keep company context
      siteId: systemSiteId || null, // DK Bas (system)
      siteRole: 'system',
    });
    console.log('[uploadUserAvatar] ✅ Uploaded to Azure (DK Bas/system site):', url);
    return url;
  } catch (error) {
    // Fallback to Firebase Storage (for backwards compatibility)
    console.warn('[uploadUserAvatar] ⚠️ Azure upload failed, falling back to Firebase:', error);
    const path = `user-avatars/${companyId}/${uid}/${fileName}`;
    const r = storageRef(storage, path);
    const contentType = String(file?.type || '').trim() || 'image/jpeg';
    await uploadBytes(r, file, { contentType });
    return await getDownloadURL(r);
  }
}

/**
 * Upload company logo to Azure (with fallback to Firebase Storage)
 * @param {Object} options - Upload options
 * @param {string} options.companyId - Company ID
 * @param {File|Blob} options.file - Logo file
 * @returns {Promise<string>} Logo URL
 */
export async function uploadCompanyLogo({ companyId, file }) {
  if (!companyId) throw new Error('companyId is required');
  if (!file) throw new Error('file is required');
  
  const safeCompanyId = String(companyId).trim();
  const fileName = `${Date.now()}_${file.name}`;
  const azurePath = `01-Company/${safeCompanyId}/Logos/${fileName}`;
  
  try {
    // IMPORTANT GUARD:
    // DK Site (role=projects) must remain a pure project site.
    // System folders like 01-Company/02-Projects must live in DK Bas (role=system).
    const systemSiteId = await getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: true });

    // Try to ensure system folder structure exists first (but don't fail if auth is not available)
    try {
      const { ensureSystemFolderStructure } = await import('../services/azure/fileService');
      await ensureSystemFolderStructure(systemSiteId || null);
    } catch (folderError) {
      // Folder structure creation failed (likely auth issue) - this is OK, uploadFile will create folders as needed
      if (folderError?.message && !folderError.message.includes('Popup window was blocked')) {
        console.warn('[uploadCompanyLogo] Warning ensuring folder structure:', folderError);
      }
    }
    
    const url = await uploadFileToAzure({
      file,
      path: azurePath,
      companyId, // keep company context
      siteId: systemSiteId || null, // DK Bas (system)
      siteRole: 'system',
    });
    console.log('[uploadCompanyLogo] ✅ Uploaded to Azure (DK Bas/system site):', url);
    return url;
  } catch (error) {
    // Check if error is related to authentication/popup blocking
    const isAuthError = error?.message && (
      error.message.includes('Popup window was blocked') ||
      error.message.includes('authenticate') ||
      error.message.includes('access token')
    );
    
    // Fallback to Firebase Storage (for backwards compatibility)
    if (isAuthError) {
      console.log('[uploadCompanyLogo] ℹ️ Azure authentication not available, using Firebase Storage (this is normal until you authenticate with SharePoint)');
    } else {
      console.warn('[uploadCompanyLogo] ⚠️ Azure upload failed, falling back to Firebase:', error);
    }
    
    const path = `company-logos/${encodeURIComponent(safeCompanyId)}/${fileName}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  }
}

export async function adminFetchCompanyMembers(companyId) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'adminFetchCompanyMembers');
  const res = await fn({ companyId });
  return res && res.data ? res.data : res;
}

export async function provisionCompanyRemote({ companyId, companyName }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'provisionCompany');
  const res = await fn({ companyId, companyName });
  return res && res.data ? res.data : res;
}

export async function requestSubscriptionUpgradeRemote({ companyId }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'requestSubscriptionUpgrade');
  const res = await fn({ companyId });
  return res && res.data ? res.data : res;
}

export async function setSuperadminRemote({ email, uid }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'setSuperadmin');
  const res = await fn({ email, uid });
  return res && res.data ? res.data : res;
}

export async function setCompanyStatusRemote({ companyId, enabled, deleted }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'setCompanyStatus');
  const payload = { companyId };
  if (enabled !== undefined) payload.enabled = enabled;
  if (deleted !== undefined) payload.deleted = deleted;
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

export async function setCompanyUserLimitRemote({ companyId, userLimit }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'setCompanyUserLimit');
  const payload = { companyId, userLimit };
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

export async function setCompanyNameRemote({ companyId, companyName }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'setCompanyName');
  const payload = { companyId, companyName };
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

export async function purgeCompanyRemote({ companyId }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'purgeCompany');
  const payload = { companyId };
  const res = await fn(payload);
  return res && res.data ? res.data : res;
}

export async function fetchAdminAuditForCompany(companyId, limitCount = 50) {
  if (!db) throw new Error('Firestore not initialized');
  const q = query(
    collection(db, 'admin_audit'),
    where('companyId', '==', companyId)
  );
  const snap = await getDocs(q);
  const items = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    items.push({ id: docSnap.id, ...data });
  });
  // Sortera senaste först på klientsidan för att undvika composite index-krav
  items.sort((a, b) => {
    const ta = a && a.ts && typeof a.ts.toMillis === 'function' ? a.ts.toMillis() : 0;
    const tb = b && b.ts && typeof b.ts.toMillis === 'function' ? b.ts.toMillis() : 0;
    return tb - ta;
  });
  if (limitCount && items.length > limitCount) {
    return items.slice(0, limitCount);
  }
  return items;
}

// Global admin audit fetcher. If companyId is provided, filters on that company,
// otherwise returns latest events across all companies.
export async function fetchAdminAuditEvents({ companyId = null, limitCount = 100 } = {}) {
  if (!db) throw new Error('Firestore not initialized');
  const baseCol = collection(db, 'admin_audit');
  let q;
  if (companyId) {
    // Endast filter på companyId här; sortering sker i klienten för att
    // undvika krav på composite-index (companyId + ts).
    q = query(baseCol, where('companyId', '==', companyId));
  } else {
    q = query(baseCol, orderBy('ts', 'desc'), limit(limitCount));
  }
  const snap = await getDocs(q);
  const items = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    items.push({ id: docSnap.id, ...data });
  });
  // Säkerställ konsekvent sortering (senaste först) även i filtrerat läge
  items.sort((a, b) => {
    const ta = a && a.ts && typeof a.ts.toMillis === 'function' ? a.ts.toMillis() : 0;
    const tb = b && b.ts && typeof b.ts.toMillis === 'function' ? b.ts.toMillis() : 0;
    return tb - ta;
  });
  if (limitCount && items.length > limitCount) {
    return items.slice(0, limitCount);
  }
  return items;
}

async function getAuthDebugSnapshot() {
  const snap = {
    projectId: firebaseConfig?.projectId || null,
    uid: auth?.currentUser?.uid || null,
    email: auth?.currentUser?.email || null,
    claimsCompanyId: null,
    storedCompanyId: null,
  };
  try {
    if (auth?.currentUser?.getIdTokenResult) {
      const tokenRes = await auth.currentUser.getIdTokenResult(false).catch((e) => null);
      snap.claimsCompanyId = tokenRes?.claims?.companyId || null;
    }
  } catch(_e) {}
  try {
    snap.storedCompanyId = await AsyncStorage.getItem('dk_companyId');
  } catch(_e) {}
  return snap;
}

async function resolveCompanyId(preferredCompanyId, payload) {
  // Prefer explicit override first.
  // In onboarding / role changes it's common that custom claims are stale until
  // the client refreshes its token; using the override avoids querying the wrong company.
  if (preferredCompanyId) return preferredCompanyId;

  // Next prefer payload-provided companyId.
  if (payload && payload.companyId) return payload.companyId;

  // Finally fall back to authenticated user's companyId claim when available.
  try {
    const user = auth && auth.currentUser;
    if (user && user.getIdTokenResult) {
      const tokenRes = await user.getIdTokenResult(false).catch((e) => null);
      const claims = tokenRes && tokenRes.claims ? tokenRes.claims : {};
      if (claims && claims.companyId) return claims.companyId;
    }
  } catch(_e) {}

  try {
    const stored = await AsyncStorage.getItem('dk_companyId');
    if (stored) return stored;
  } catch(_e) {}
  return null;
}

// Sanitize objects for Firestore: Firestore does not allow nested arrays (arrays inside arrays).
// Convert any nested array values into an object map with numeric keys so writes succeed.
function sanitizeForFirestore(value) {
  // Ensure no nested arrays exist anywhere in the data structure.
  // Firestore rejects nested arrays (arrays containing arrays) at any depth.
  // NOTE: Arrays inside objects are fine (e.g. group.members: []), so only rewrite
  // arrays that directly contain array elements.
  const isPlainObject = (v) => {
    if (!v || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  };

  function _walk(v) {
    if (Array.isArray(v)) {
      // Rewrite only true nested arrays: arrays that contain array elements.
      const hasNestedArray = v.some((el) => Array.isArray(el));
      if (hasNestedArray) {
        const obj = {};
        for (let i = 0; i < v.length; i++) obj[i] = _walk(v[i]);
        return obj;
      }
      // Safe to keep as array; sanitize elements.
      return v.map((el) => _walk(el));
    }
    // Only walk plain objects. Preserve special SDK objects like Firestore FieldValue
    // (e.g. serverTimestamp()), DocumentReference, etc.
    if (isPlainObject(v)) {
      const out = {};
      for (const k of Object.keys(v)) out[k] = _walk(v[k]);
      return out;
    }
    return v;
  }

  try {
    return _walk(value);
  } catch(e) {
    console.warn('[firebase] sanitizeForFirestore failed, falling back to JSON stringify', e);
    // As a last resort, stringify the whole payload so setDoc won't throw nested-array errors.
    try {
      return { __json: JSON.stringify(value) };
    } catch(_e) {
      return null;
    }
  }
}

// Helpers for syncing hierarchy per company
export async function fetchHierarchy(companyId) {
  if (!companyId) {
    console.log('[fetchHierarchy] No companyId provided');
    return [];
  }
  try {
    console.log('[fetchHierarchy] Fetching hierarchy for company:', companyId);
    const ref = doc(db, 'foretag', companyId, 'hierarki', 'state');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      console.log('[fetchHierarchy] Document exists, checking structure...');
      
      // Check if we have the new structure (items array)
      const hasItems = Array.isArray(data.items) && data.items.length > 0;
      const hasChildren = data.children && Array.isArray(data.children) && data.children.length > 0;
      
      // IMPORTANT: If both items and children exist, we have a mixed structure
      // Check if children contains projects that are not in items
      if (hasItems && hasChildren) {
        console.warn('[fetchHierarchy] ⚠️ WARNING: Both items and children exist! This is a mixed structure.');
        console.warn('[fetchHierarchy] ⚠️ Items has', data.items.length, 'items, children has', data.children.length, 'items');
        
        // Helper function to find all projects in a hierarchy
        const findAllProjects = (items) => {
          const projects = [];
          const walk = (nodes) => {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(node => {
              if (node && node.type === 'project' && node.id) {
                projects.push({ id: node.id, name: node.name });
              }
              if (node && node.children && Array.isArray(node.children)) {
                walk(node.children);
              }
            });
          };
          walk(items);
          return projects;
        };
        
        const projectsInItems = findAllProjects(data.items);
        const projectsInChildren = findAllProjects(data.children);
        
        console.log('[fetchHierarchy] Projects in items:', projectsInItems.map(p => p.id).join(', '));
        console.log('[fetchHierarchy] Projects in children:', projectsInChildren.map(p => p.id).join(', '));
        
        // If children has projects that are not in items, we need to merge them
        const missingProjects = projectsInChildren.filter(p => 
          !projectsInItems.some(ip => String(ip.id).trim() === String(p.id).trim())
        );
        
        if (missingProjects.length > 0) {
          console.warn('[fetchHierarchy] ⚠️ Found', missingProjects.length, 'projects in children that are not in items:', missingProjects.map(p => p.id).join(', '));
          console.warn('[fetchHierarchy] ⚠️ Using children as source and migrating to items...');
          
          // Use children as the source (it has the actual project data)
          try {
            await setDoc(ref, { 
              items: data.children, 
              updatedAt: serverTimestamp() 
            }, { merge: false });
            console.log('[fetchHierarchy] ✅ Migrated children to items - removed children from root');
            return data.children;
          } catch(migrateErr) {
            console.error('[fetchHierarchy] ❌ Failed to migrate structure:', migrateErr);
            // Return children anyway so the app can work
            return data.children;
          }
        } else {
          // All projects are in items, just remove children
          console.warn('[fetchHierarchy] ⚠️ All projects are in items. Removing children from root...');
          try {
            await setDoc(ref, { 
              items: data.items, 
              updatedAt: serverTimestamp() 
            }, { merge: false });
            console.log('[fetchHierarchy] ✅ Migrated mixed structure - removed children from root');
            return data.items;
          } catch(migrateErr) {
            console.error('[fetchHierarchy] ❌ Failed to migrate mixed structure:', migrateErr);
            // Return items anyway
            return data.items;
          }
        }
      }
      
      if (hasItems) {
        console.log('[fetchHierarchy] ✅ Found new structure with', data.items.length, 'items');
        return data.items;
      }
      
      // Check if we have old structure with children directly in document (not in items)
      // This happens when data was saved incorrectly or migrated from old structure
      if (hasChildren) {
        console.warn('[fetchHierarchy] ⚠️ Found old structure (children directly in document, not in items). Migrating to new structure...');
        console.log('[fetchHierarchy] Old structure has', data.children.length, 'children');
        
        // Migrate: wrap children in items array
        const migratedItems = data.children;
        
        // Save the migrated structure (remove children from root, put in items)
        try {
          await setDoc(ref, { 
            items: migratedItems, 
            updatedAt: serverTimestamp() 
          }, { merge: false });
          console.log('[fetchHierarchy] ✅ Migrated old structure (children) to new structure (items)');
          console.log('[fetchHierarchy] ✅ Migration complete. Project should now be in items array.');
          return migratedItems;
        } catch(migrateErr) {
          console.error('[fetchHierarchy] ❌ Failed to migrate structure:', migrateErr);
          // Return the children anyway so the app can work
          return migratedItems;
        }
      }
      
      // Check if we have old structure (project directly in document)
      // This is a migration case - convert old structure to new
      if (data.type === 'project' && data.id) {
        console.warn('[fetchHierarchy] ⚠️ Found old structure (project directly in document). Migrating to new structure...');
        console.log('[fetchHierarchy] Old project data:', { id: data.id, name: data.name });
        // Create a new structure with the project in items array
        const migratedItems = [{
          type: 'main',
          id: 'main-migrated',
          name: 'Migrerad',
          children: [{
            type: 'sub',
            id: 'sub-migrated',
            name: 'Migrerad',
            children: [{
              ...data,
              // Keep all project fields
            }]
          }]
        }];
        
        // Save the migrated structure
        try {
          await setDoc(ref, { items: migratedItems, updatedAt: serverTimestamp() }, { merge: false });
          console.log('[fetchHierarchy] ✅ Migrated old structure to new structure');
          return migratedItems;
        } catch(migrateErr) {
          console.error('[fetchHierarchy] ❌ Failed to migrate structure:', migrateErr);
          // Return empty array if migration fails
          return [];
        }
      }
      
      // No valid structure found
      console.warn('[fetchHierarchy] ⚠️ No valid structure found in document');
      return [];
    } else {
      console.log('[fetchHierarchy] Document does not exist');
    }
  } catch(_e) {
    // Silent fail -> caller can fall back to local storage
    console.error('[fetchHierarchy] ❌ Error fetching hierarchy:', _e);
  }
  return [];
}

export async function saveHierarchy(companyId, items) {
  if (!companyId) return false;
  try {
    const ref = doc(db, 'foretag', companyId, 'hierarki', 'state');
    
    // SÄKERHET: Skapa backup innan vi skriver över data
    // Hämta befintlig hierarki först
    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        let existingItems = Array.isArray(existingData?.items) ? existingData.items : [];
        
        // Handle old structure where project is directly in document
        if (existingItems.length === 0 && existingData?.type === 'project' && existingData?.id) {
          console.warn('[saveHierarchy] ⚠️ Found old structure (project directly in document). Will be migrated on next fetch.');
          // Don't create backup for old structure - it will be migrated by fetchHierarchy
          existingItems = [];
        }
        
        // IMPORTANT: If children exists directly in document, we need to migrate it to items
        // This happens when there's a mixed structure
        if (existingItems.length === 0 && existingData?.children && Array.isArray(existingData.children) && existingData.children.length > 0) {
          console.warn('[saveHierarchy] ⚠️ Found children in document but items is empty. Migrating children to items...');
          existingItems = existingData.children;
        }
        
        // VALIDERING: Förhindra att tom hierarki skriver över befintlig data
        // Om den nya hierarkin är tom men det fanns data tidigare, avbryt
        const newItems = Array.isArray(items) ? items : [];
        if (newItems.length === 0 && existingItems.length > 0) {
          console.warn('[saveHierarchy] Förhindrade att skriva över befintlig hierarki med tom array');
          return false;
        }
        
        // Skapa backup i Firestore (spara senaste versionen)
        if (existingItems.length > 0) {
          const backupRef = doc(db, 'foretag', companyId, 'hierarki', 'backup_' + Date.now());
          try {
            await setDoc(backupRef, {
              items: existingItems,
              backedUpAt: serverTimestamp(),
              reason: 'pre_save_backup'
            });
            // Behåll bara de 5 senaste backup:erna (rensar gamla)
            // Kör asynkront så det inte blockerar huvudoperationen
            // Behåll bara de 5 senaste backup:erna (rensar gamla)
            // Kör asynkront så det inte blockerar huvudoperationen, men vänta lite för att säkerställa att backup sparades
            // Backup-rensning körs asynkront i bakgrunden
            // Kör direkt (inte setTimeout) för att säkerställa att den faktiskt körs
            (async () => {
              // Vänta lite för att säkerställa att backup sparades
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                console.log('[saveHierarchy] Startar backup-rensning...');
                const backupsRef = collection(db, 'foretag', companyId, 'hierarki');
                // Hämta alla backup-dokument (sortera efter ID som innehåller timestamp)
                const backupsSnap = await getDocs(backupsRef);
                const backups = [];
                backupsSnap.forEach(d => {
                  if (d.id.startsWith('backup_') && d.id !== 'state') {
                    const timestamp = parseInt(d.id.replace('backup_', '')) || 0;
                    backups.push({ id: d.id, timestamp });
                  }
                });
                
                console.log(`[saveHierarchy] Hittade ${backups.length} backup-filer`);
                
                // Sortera efter timestamp (nyaste först)
                backups.sort((a, b) => b.timestamp - a.timestamp);
                
                // Ta bort alla utom de 5 senaste
                if (backups.length > 5) {
                  console.log(`[saveHierarchy] Rensar ${backups.length - 5} gamla backup-filer...`);
                  let deletedCount = 0;
                  let permissionErrors = 0;
                  for (let i = 5; i < backups.length; i++) {
                    try {
                      await deleteDoc(doc(backupsRef, backups[i].id));
                      deletedCount++;
                      console.log(`[saveHierarchy] ✅ Raderade backup: ${backups[i].id}`);
                    } catch(deleteErr) {
                      // Check if it's a permission error
                      if (deleteErr?.code === 'permission-denied') {
                        permissionErrors++;
                        console.log(`[saveHierarchy] ℹ️ Backup ${backups[i].id} kunde inte raderas (permissions)`);
                      } else {
                        console.warn(`[saveHierarchy] ⚠️ Kunde inte radera backup ${backups[i].id}:`, deleteErr);
                      }
                    }
                  }
                  if (deletedCount > 0) {
                    console.log(`[saveHierarchy] ✅ Backup-rensning klar. Raderade ${deletedCount} filer, behöll ${Math.min(5, backups.length)} backup-filer.`);
                  }
                  if (permissionErrors > 0) {
                    console.log(`[saveHierarchy] ℹ️ ${permissionErrors} backup-filer kunde inte raderas automatiskt (permissions). De kan rensas manuellt i Firebase.`);
                  }
                } else {
                  console.log(`[saveHierarchy] ✅ Inga backup-filer att rensa (${backups.length} totalt, max 5 tillåtet)`);
                }
              } catch(cleanupErr) {
                // Don't log as error if it's just a permission issue
                if (cleanupErr?.code === 'permission-denied') {
                  console.log('[saveHierarchy] ℹ️ Backup-rensning kräver permissions (kan rensas manuellt i Firebase)');
                } else {
                  console.warn('[saveHierarchy] ⚠️ Backup-rensning misslyckades:', cleanupErr);
                }
              }
            })();
          } catch(_e) {
            // Backup misslyckades, men fortsätt ändå med huvudoperationen
            console.warn('[saveHierarchy] Backup misslyckades:', _e);
          }
        }
      }
    } catch(_e) {
      // Om vi inte kan läsa befintlig data, fortsätt ändå
      console.warn('[saveHierarchy] Kunde inte läsa befintlig hierarki för backup:', _e);
    }
    
    // Skriv den nya hierarkin
    // VIKTIGT: Använd { merge: false } för att ersätta hela dokumentet, inte bara uppdatera fält
    // Detta säkerställer att items-arrayen uppdateras korrekt och tar bort gamla fält
    // Rensa bort alla fält som inte ska finnas (t.ex. gamla projekt-fält direkt i dokumentet)
    const cleanData = {
      items: Array.isArray(items) ? items : [],
      updatedAt: serverTimestamp()
    };
    
    // Ta bort alla andra fält genom att använda merge: false
    await setDoc(ref, cleanData, { merge: false });
    console.log('[saveHierarchy] ✅ Hierarchy sparad till Firestore. Items count:', cleanData.items.length);
    console.log('[saveHierarchy] ✅ Dokumentet har rensats - bara items och updatedAt finns kvar');
    return true;
  } catch(_e) {
    console.error('[saveHierarchy] Fel vid sparande:', _e);
    return false;
  }
}

// Company profile: name, logoUrl, etc.
export async function fetchCompanyProfile(companyId) {
  if (!companyId) return null;
  try {
    const ref = doc(db, 'foretag', companyId, 'profil', 'public');
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
  } catch(_e) {}
  return null;
}

/**
 * Get SharePoint Site ID for a company
 * @param {string} companyId - Company ID
 * @returns {Promise<string|null>} SharePoint Site ID or null if not configured
 */
export async function getCompanySharePointSiteId(companyId) {
  if (!companyId) return null;
  try {
    const profile = await fetchCompanyProfile(companyId);
    const primary = profile?.primarySharePointSite;
    const primaryId = primary && typeof primary === 'object' ? String(primary.siteId || '').trim() : '';
    if (primaryId) return primaryId;
    return profile?.sharePointSiteId || null;
  } catch (error) {
    console.warn('[getCompanySharePointSiteId] Error fetching site ID:', error);
    return null;
  }
}

/**
 * Save SharePoint Site ID to company profile
 * @param {string} companyId - Company ID
 * @param {string} siteId - SharePoint Site ID
 * @param {string} [webUrl] - SharePoint Site Web URL (optional)
 * @returns {Promise<void>}
 */
export async function saveCompanySharePointSiteId(companyId, siteId, webUrl = null) {
  if (!companyId || !siteId) {
    throw new Error('Company ID and Site ID are required');
  }
  try {
    const ref = doc(db, 'foretag', companyId, 'profil', 'public');
    const updateData = {
      // Legacy fields (kept for backwards compatibility)
      sharePointSiteId: siteId,
      sharePointWebUrl: webUrl || null,

      // New canonical linkage object
      primarySharePointSite: {
        siteId,
        siteUrl: webUrl || null,
        linkedAt: serverTimestamp(),
        linkedBy: auth.currentUser?.uid || null,
      },

      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, updateData);
    console.log(`[saveCompanySharePointSiteId] ✅ Saved SharePoint Site ID for company: ${companyId}`);
  } catch (error) {
    console.error('[saveCompanySharePointSiteId] Error saving site ID:', error);
    throw error;
  }
}

// Fetch a flat list of companies (foretag). Returns array of { id, profile }
export async function fetchCompanies() {
  try {
    // Firestore rules do not allow listing /foretag docs directly, but
    // profiles under /foretag/{company}/profil/{docId} are world-readable.
    // Use a collection group on "profil" and then map each "public" doc
    // back to its company id.
    const baseRef = collectionGroup(db, 'profil');
    const snap = await getDocs(baseRef);
    const out = [];

    snap.forEach((d) => {
      try {
        if (!d || d.id !== 'public') return; // only use the public profile docs
        const profilCol = d.ref.parent; // .../foretag/{company}/profil
        const companyDoc = profilCol && profilCol.parent; // .../foretag/{company}
        const companyId = companyDoc && companyDoc.id ? companyDoc.id : null;
        if (!companyId) return;
        out.push({ id: companyId, profile: d.data() || null });
      } catch (_e) {
        // Ignore individual mapping errors; continue with others
      }
    });

    // Sort by display name if available, otherwise by id
    out.sort((a, b) => {
      const an = String((a.profile && (a.profile.companyName || a.profile.name)) || a.id || '').toLowerCase();
      const bn = String((b.profile && (b.profile.companyName || b.profile.name)) || b.id || '').toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });

    return out;
  } catch (_e) {
    return [];
  }
}

// Resolve the company logo URL from profile.public.logoUrl.
// Supports both https(s) URLs and gs:// storage URLs.
export async function resolveCompanyLogoUrl(companyId) {
  if (!companyId) return null;
  const profile = await fetchCompanyProfile(companyId);
  const logoUrl = profile?.logoUrl || null;
  if (!logoUrl) return null;

  // If a gs:// URL is stored, convert it to an HTTPS download URL.
  if (typeof logoUrl === 'string' && logoUrl.trim().toLowerCase().startsWith('gs://')) {
    try {
      const raw = logoUrl.trim();
      const match = raw.match(/^gs:\/\/([^\/]+)\/(.+)$/i);
      const bucket = match && match[1] ? String(match[1]) : '';
      const fullPath = match && match[2] ? String(match[2]) : '';
      if (!fullPath) return null;

      // Some environments are picky about ref-from-gs:// URLs. Use bucket+path explicitly.
      // Also handle common mismatch between provided bucket domains.
      const bucketCandidates = [];
      if (bucket) {
        bucketCandidates.push(bucket);
        if (bucket.toLowerCase().endsWith('.firebasestorage.app')) {
          bucketCandidates.push(bucket.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
        }
      }

      for (const b of bucketCandidates.length > 0 ? bucketCandidates : ['']) {
        try {
          // On web prefer the public GCS URL (avoids tokenized REST calls that sometimes 403 in browsers)
          if (Platform && Platform.OS === 'web' && b) {
            try {
              const publicUrl = 'https://storage.googleapis.com/' + b + '/' + encodeURI(fullPath.replace(/^\/+/, ''));
              return publicUrl;
            } catch (_e) {
              // fall back to SDK below
            }
          }
          const st = b ? getStorage(app, `gs://${b}`) : storage;
          const r = storageRef(st, fullPath);
          const https = await getDownloadURL(r);
          if (https) return https;
        } catch (_inner) {
          // fall through and try other bucket candidates
        }
      }

      return null;
    } catch(_e) {
      return null;
    }
  }

  return logoUrl;
}

export async function saveCompanyProfile(companyId, profile) {
  if (!companyId) return false;
  try {
    const ref = doc(db, 'foretag', companyId, 'profil', 'public');
    await setDoc(ref, profile, { merge: true });
    return true;
  } catch(_e) {
    return false;
  }
}

// User profile helpers
export async function fetchUserProfile(uid) {
  if (!uid) return null;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
  } catch(_e) {}
  return null;
}

// Company member directory (scoped under foretag/{companyId}/members/{uid})
// Used for listing admins and other roles inside a company.
export async function upsertCompanyMember({ companyId: companyIdOverride, uid, displayName, email, role }) {
  try {
    if (!uid) return false;
    const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
    if (!companyId) return false;
    const ref = doc(db, 'foretag', companyId, 'members', uid);
    await setDoc(ref, {
      uid,
      companyId,
      displayName: displayName || null,
      email: email || null,
      role: role || null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch(_e) {
    return false;
  }
}

export async function fetchCompanyMembers(companyIdOverride, { role } = {}) {
  async function attemptRead({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }

    const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
    if (!companyId) return { ok: true, out: [], err: null, permissionDenied: false, companyId: null };

    try {
      const baseRef = collection(db, 'foretag', companyId, 'members');
      const q = role ? query(baseRef, where('role', '==', role)) : query(baseRef);
      // Prefer server to avoid stale/empty cache on fresh logins.
      let snap;
      try {
        snap = await getDocsFromServer(q);
      } catch(_e) {
        snap = await getDocs(q);
      }
      const out = [];
      snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      out.sort((a, b) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''), undefined, { sensitivity: 'base' }));
      return {
        ok: true,
        out,
        err: null,
        permissionDenied: false,
        companyId,
        meta: {
          size: snap?.size ?? out.length,
          fromCache: snap?.metadata?.fromCache ?? null,
        }
      };
    } catch (e) {
      const permissionDenied = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      return { ok: false, out: [], err: e, permissionDenied, companyId, meta: null };
    }
  }

  try {
    const first = await attemptRead({ forceTokenRefresh: false });
    if (first.ok) return first.out;

    if (first.permissionDenied) {
      const second = await attemptRead({ forceTokenRefresh: true });
      if (second.ok) return second.out;

      // Persist debug info so we can inspect on the client via existing debug UI.
      try {
        const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
        let arr = rawArr ? JSON.parse(rawArr) : [];
        const debug = await getAuthDebugSnapshot();
        const entry = {
          fn: 'fetchCompanyMembers',
          code: second.err?.code || first.err?.code || null,
          err: (second.err && second.err.message) ? second.err.message : ((first.err && first.err.message) ? first.err.message : String(second.err || first.err)),
          ts: new Date().toISOString(),
          role: role || null,
          resolvedCompanyId: second.companyId || first.companyId || null,
          auth: debug,
        };
        arr.push(entry);
        await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
        await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
      } catch(_e) {}

      return [];
    }

    // Log any non-permission errors too (e.g. failed-precondition, offline, etc)
    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      const entry = {
        fn: 'fetchCompanyMembers',
        code: first.err?.code || null,
        err: (first.err && first.err.message) ? first.err.message : String(first.err),
        ts: new Date().toISOString(),
        role: role || null,
        resolvedCompanyId: first.companyId || null,
        meta: first.meta || null,
        auth: debug,
      };
      arr.push(entry);
      await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
      await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
    } catch(_e) {}

    return [];
  } catch(_e) {
    return [];
  }
}

// Realtime subscription for company members (used for ansvarig picker).
// Returns an unsubscribe function.
export function subscribeCompanyMembers(companyIdOverride, { role, onData, onError } = {}) {
  let unsub = null;
  (async () => {
    try {
      const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
      if (!companyId) {
        try { if (typeof onData === 'function') onData([], { size: 0, fromCache: null, companyId: null }); } catch(_e) {}
        return;
      }
      const baseRef = collection(db, 'foretag', companyId, 'members');
      const q = role ? query(baseRef, where('role', '==', role)) : query(baseRef);
      unsub = onSnapshot(
        q,
        (snap) => {
          const out = [];
          snap.forEach(d => out.push({ id: d.id, ...d.data() }));
          out.sort((a, b) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''), undefined, { sensitivity: 'base' }));
          try {
            if (typeof onData === 'function') {
              onData(out, { size: snap.size, fromCache: snap.metadata?.fromCache ?? null, companyId });
            }
          } catch(_e) {}
        },
        (err) => {
          try { if (typeof onError === 'function') onError(err); } catch(_e) {}
        }
      );
    } catch(e) {
      try { if (typeof onError === 'function') onError(e); } catch(_e) {}
    }
  })();

  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
  };
}

// Save or update a user's profile document (client-side safe helper)
export async function saveUserProfile(uid, data) {
  if (!uid) return false;
  try {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, data, { merge: true });
    return true;
  } catch(_e) {
    return false;
  }
}

export async function signInEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// Log user actions (egenkontroller, skyddsronder) with company context
export async function logUserAction({ uid, email, companyId, type, payload }) {
  try {
    const ref = collection(db, 'logs');
    await addDoc(ref, {
      uid: uid || null,
      email: email || null,
      companyId: companyId || null,
      type, // e.g. 'egenkontroll' | 'skyddsrond'
      payload: payload || {},
      ts: serverTimestamp(),
    });
    return true;
  } catch(_e) {
    return false;
  }
}

// Company-scoped activity feed (for dashboard "Senaste aktivitet")
// Storage: foretag/{companyId}/activity
// Event shape example:
// { type: 'login', uid, email, displayName, ts }
export async function logCompanyActivity(event, companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, event || null);
    if (!companyId) return false;
    const ref = collection(db, 'foretag', companyId, 'activity');
    const payload = Object.assign({}, event || {}, {
      companyId,
      ts: serverTimestamp(),
    });
    await addDoc(ref, sanitizeForFirestore(payload));
    return true;
  } catch(e) {
    // Record last Firestore error for debugging (permission-denied, etc)
    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      const entry = {
        fn: 'logCompanyActivity',
        code: e?.code || null,
        err: (e && e.message) ? e.message : String(e),
        ts: new Date().toISOString(),
        companyIdOverride: companyIdOverride || null,
        eventType: event?.type || null,
        auth: debug,
      };
      arr.push(entry);
      await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
      await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
    } catch(_e) {}
    return false;
  }
}

// Realtime subscription for company activity feed.
// Returns an unsubscribe function.
export function subscribeCompanyActivity(companyIdOverride, { onData, onError, limitCount = 25 } = {}) {
  let unsub = null;
  (async () => {
    try {
      const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
      if (!companyId) {
        try { if (typeof onData === 'function') onData([], { size: 0, fromCache: null, companyId: null }); } catch(_e) {}
        return;
      }
      const baseRef = collection(db, 'foretag', companyId, 'activity');
      const q = query(baseRef, orderBy('ts', 'desc'), limit(Math.max(1, Math.min(100, Number(limitCount) || 25))));
      unsub = onSnapshot(
        q,
        (snap) => {
          const out = [];
          snap.forEach(d => out.push({ id: d.id, ...d.data() }));
          try {
            if (typeof onData === 'function') {
              onData(out, { size: snap.size, fromCache: snap.metadata?.fromCache ?? null, companyId });
            }
          } catch(_e) {}
        },
        (err) => {
          // Record last Firestore error for debugging
          (async () => {
            try {
              const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
              let arr = rawArr ? JSON.parse(rawArr) : [];
              const debug = await getAuthDebugSnapshot();
              const entry = {
                fn: 'subscribeCompanyActivity',
                code: err?.code || null,
                err: (err && err.message) ? err.message : String(err),
                ts: new Date().toISOString(),
                companyIdOverride: companyIdOverride || null,
                auth: debug,
              };
              arr.push(entry);
              await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
              await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
            } catch(_e) {}
          })();
          try { if (typeof onError === 'function') onError(err); } catch(_e) {}
        }
      );
    } catch(e) {
      // Record last Firestore error for debugging
      (async () => {
        try {
          const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
          let arr = rawArr ? JSON.parse(rawArr) : [];
          const debug = await getAuthDebugSnapshot();
          const entry = {
            fn: 'subscribeCompanyActivity',
            code: e?.code || null,
            err: (e && e.message) ? e.message : String(e),
            ts: new Date().toISOString(),
            companyIdOverride: companyIdOverride || null,
            auth: debug,
          };
          arr.push(entry);
          await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
          await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
        } catch(_e) {}
      })();
      try { if (typeof onError === 'function') onError(e); } catch(_e) {}
    }
  })();

  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
  };
}

// --- File comments (project + file scoped) ---
// Storage: foretag/{company}/projects/{projectId}/file_comments/{commentId}
// Document: companyId, projectId, fileId, authorId, authorName, text, createdAt, pageNumber?, anchor?, mentions[], visibility
// anchor: { pageNumber, type: "page"|"area", coords?: { x, y, width, height } }

export async function createFileComment(companyId, projectId, { fileId, text, pageNumber = null, anchor = null, mentions = null }) {
  const cid = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : '';
  const pid = (projectId != null && String(projectId).trim()) ? String(projectId).trim() : '';
  if (!cid || !pid || !fileId || typeof text !== 'string' || !text.trim()) {
    throw new Error('companyId, projectId, fileId and non-empty text are required');
  }
  const user = auth?.currentUser;
  const uid = user?.uid || null;
  if (!uid) {
    const err = new Error('Du måste vara inloggad för att kommentera');
    err.code = 'auth/not-authenticated';
    throw err;
  }
  const email = (user?.email && String(user.email).trim()) || '';
  const authorName = (user?.displayName && String(user.displayName).trim()) || email || uid || 'Användare';
  const mentionsList = Array.isArray(mentions) ? mentions : [];
  const pageNum = pageNumber != null && Number.isFinite(Number(pageNumber)) && Number(pageNumber) > 0 ? Number(pageNumber) : null;
  const anchorCoords = anchor?.coords && typeof anchor.coords === 'object' && [anchor.coords.x, anchor.coords.y, anchor.coords.width, anchor.coords.height].every(Number.isFinite)
    ? { x: anchor.coords.x, y: anchor.coords.y, width: anchor.coords.width, height: anchor.coords.height }
    : null;
  const anchorObj = {
    pageNumber: (anchor && anchor.pageNumber != null && Number.isFinite(Number(anchor.pageNumber)) ? Number(anchor.pageNumber) : pageNum) ?? null,
    type: anchor?.type === 'area' ? 'area' : 'page',
  };
  if (anchorCoords != null) anchorObj.coords = anchorCoords;
  const payload = {
    companyId: cid,
    projectId: pid,
    fileId: String(fileId).trim(),
    authorId: uid,
    authorName,
    text: String(text).trim(),
    createdAt: serverTimestamp(),
    mentions: mentionsList.map((m) => {
      if (m?.type === 'user') return { type: 'user', userId: m.userId ?? null, displayName: m.displayName ?? '' };
      if (m?.type === 'group') return { type: 'group', groupId: m.groupId ?? null, groupName: m.groupName ?? '' };
      if (m?.type === 'all') return { type: 'all' };
      if (m?.type === 'contact') return { type: 'contact', contactId: m.contactId ?? null, displayName: m.displayName ?? '', ...(m?.userId ? { userId: m.userId } : {}) };
      return null;
    }).filter(Boolean),
    visibility: 'project',
    anchor: anchorObj,
  };
  if (pageNum != null) payload.pageNumber = pageNum;

  async function attemptWrite(forceTokenRefresh = false) {
    if (forceTokenRefresh && user?.getIdToken) {
      try { await user.getIdToken(true); } catch (_e) {}
    }
    const ref = collection(db, 'foretag', cid, 'projects', pid, 'file_comments');
    const docRef = await addDoc(ref, sanitizeForFirestore(payload));
    return { id: docRef.id, ...payload, createdAt: new Date() };
  }

  try {
    return await attemptWrite(false);
  } catch (e) {
    const isPermissionDenied = e?.code === 'permission-denied' || (e?.message && String(e.message).toLowerCase().includes('permission'));
    if (isPermissionDenied) {
      try {
        return await attemptWrite(true);
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw e;
  }
}

/**
 * Delete a file comment. Only the comment author may delete (enforced by Firestore rules).
 */
export async function deleteFileComment(companyId, projectId, commentId) {
  const cid = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : '';
  const pid = (projectId != null && String(projectId).trim()) ? String(projectId).trim() : '';
  if (!cid || !pid || !commentId) throw new Error('companyId, projectId and commentId are required');
  const ref = doc(db, 'foretag', cid, 'projects', pid, 'file_comments', String(commentId));
  await deleteDoc(ref);
}

/**
 * Subscribe to file comments for a given project + file.
 * Returns an unsubscribe function.
 * onData(list, meta) where list is sorted oldest first (createdAt asc).
 */
export function subscribeFileComments(companyId, projectId, fileId, { onData, onError } = {}) {
  let unsub = null;
  if (!companyId || !projectId || !fileId) {
    try { if (typeof onData === 'function') onData([], { companyId, projectId, fileId }); } catch(_e) {}
    return () => {};
  }
  try {
    const ref = collection(db, 'foretag', companyId, 'projects', projectId, 'file_comments');
    const q = query(
      ref,
      where('fileId', '==', String(fileId).trim()),
      orderBy('createdAt', 'asc')
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        const out = [];
        snap.forEach((d) => {
          const data = d.data();
          out.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null,
          });
        });
        try {
          if (typeof onData === 'function') {
            onData(out, { size: snap.size, companyId, projectId, fileId });
          }
        } catch (_e) {}
      },
      (err) => {
        try { if (typeof onError === 'function') onError(err); } catch(_e) {}
      }
    );
  } catch (e) {
    try { if (typeof onError === 'function') onError(e); } catch(_e) {}
  }
  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
  };
}

/**
 * Subscribe to all file comments for a project (for badges in file list).
 * Returns an unsubscribe function.
 * onData(comments) where each comment has id, fileId, pageNumber?, anchor?, ...
 */
export function subscribeProjectFileComments(companyId, projectId, { onData, onError } = {}) {
  let unsub = null;
  if (!companyId || !projectId) {
    try { if (typeof onData === 'function') onData([]); } catch(_e) {}
    return () => {};
  }
  try {
    const ref = collection(db, 'foretag', String(companyId).trim(), 'projects', String(projectId).trim(), 'file_comments');
    const q = query(ref, orderBy('createdAt', 'asc'));
    unsub = onSnapshot(
      q,
      (snap) => {
        const out = [];
        snap.forEach((d) => {
          const data = d.data();
          out.push({
            id: d.id,
            ...data,
            fileId: data.fileId ?? null,
            pageNumber: data.pageNumber ?? data.anchor?.pageNumber ?? null,
            createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null,
          });
        });
        try { if (typeof onData === 'function') onData(out); } catch(_e) {}
      },
      (err) => { try { if (typeof onError === 'function') onError(err); } catch(_e) {} }
    );
  } catch (e) {
    try { if (typeof onError === 'function') onError(e); } catch(_e) {}
  }
  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
  };
}

/**
 * Fetch project organisation once (for building mention suggestions / expanding @all and @group).
 * Returns { groups: [{ id, title, members: [{ source, refId, name, email, ... }] }] }.
 */
export async function getProjectOrganisation(companyId, projectId) {
  if (!companyId || !projectId) return { groups: [] };
  const ref = doc(db, 'foretag', String(companyId).trim(), 'project_organisation', String(projectId).trim());
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const raw = data?.groups;
  const groups = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? Object.keys(raw).map((k) => raw[k]) : []);
  return { groups: groups.map((g) => ({
    id: g?.id ?? '',
    title: g?.title ?? 'Grupp',
    members: Array.isArray(g?.members) ? g.members : [],
  })) };
}

/**
 * Resolve mentions to a deduplicated list of user IDs (Firebase UIDs) for notifications.
 * - type user: [userId] (including self if author tags themselves)
 * - type group: all members in that group with source==='user' -> refId
 * - type all: all members from all groups with source==='user' -> refId
 */
function resolveMentionUserIds(mentions, organisation, authorId) {
  const seen = new Set();
  const out = [];
  const groups = organisation?.groups || [];

  const add = (uid) => {
    const id = uid && String(uid).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  for (const m of mentions || []) {
    if (m?.type === 'user' && m?.userId) add(m.userId);
    if (m?.type === 'contact' && m?.userId) add(m.userId);
    if (m?.type === 'group' && m?.groupId) {
      const g = groups.find((gr) => String(gr?.id || '') === String(m.groupId));
      if (g?.members) for (const mem of g.members) { if (String(mem?.source || '') === 'user' && mem?.refId) add(mem.refId); }
    }
    if (m?.type === 'all') {
      for (const g of groups) {
        if (g?.members) for (const mem of g.members) { if (String(mem?.source || '') === 'user' && mem?.refId) add(mem.refId); }
      }
    }
  }
  return out;
}

/**
 * Create notifications for users mentioned in a comment.
 * Collection: foretag/{company}/projects/{projectId}/notifications/{notificationId}
 * Deduplicates so each user gets at most one notification per comment.
 */
export async function createCommentNotifications(companyId, projectId, {
  commentId,
  fileId,
  fileName = null,
  pageNumber = null,
  authorId,
  authorName,
  textPreview = '',
  mentions = null,
}) {
  if (!companyId || !projectId || !commentId || !fileId || !authorId) return;
  const cid = String(companyId).trim();
  const pid = String(projectId).trim();
  const organisation = await getProjectOrganisation(cid, pid);
  const userIds = resolveMentionUserIds(mentions || [], organisation, authorId);
  if (userIds.length === 0) return;
  const colRef = collection(db, 'foretag', cid, 'projects', pid, 'notifications');
  const preview = String(textPreview || '').trim().slice(0, 200);
  for (const userId of userIds) {
    try {
      await addDoc(colRef, sanitizeForFirestore({
        type: 'comment_mention',
        userId,
        companyId: cid,
        projectId: pid,
        commentId,
        fileId,
        fileName: fileName ? String(fileName).trim() : null,
        pageNumber: pageNumber != null && Number.isFinite(Number(pageNumber)) ? Number(pageNumber) : null,
        authorId,
        authorName: String(authorName || '').trim() || 'Användare',
        textPreview: preview,
        createdAt: serverTimestamp(),
        read: false,
      }));
    } catch (_e) {}
  }
}

/**
 * Subscribe to notifications for the current user (comment mentions, etc.) across all projects.
 * Uses collection group query on "notifications" with userId == currentUserId.
 * Returns unsubscribe function.
 */
export function subscribeUserNotifications(companyId, currentUserId, { onData, onError, limitCount = 50 } = {}) {
  const cid = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : '';
  const uid = (currentUserId != null && String(currentUserId).trim()) ? String(currentUserId).trim() : '';
  if (!cid || !uid) {
    try { if (typeof onData === 'function') onData([]); } catch (_e) {}
    return () => {};
  }
  let unsub = null;
  try {
    const colRef = collectionGroup(db, 'notifications');
    const q = query(
      colRef,
      where('userId', '==', uid),
      where('companyId', '==', cid),
      orderBy('createdAt', 'desc'),
      limit(Math.max(1, Math.min(100, Number(limitCount) || 50)))
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        const out = [];
        snap.forEach((d) => {
          const data = d.data();
          out.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null,
          });
        });
        try { if (typeof onData === 'function') onData(out); } catch (_e) {}
      },
      (err) => {
        try { if (typeof onError === 'function') onError(err); } catch (_e) {}
      }
    );
  } catch (e) {
    try { if (typeof onError === 'function') onError(e); } catch (_e) {}
  }
  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch (_e) {}
  };
}

// Controls persistence helpers
export async function saveControlToFirestore(control, companyIdOverride) {
  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (!control) return { ok: false, err: null, permissionDenied: false };
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }
    const companyId = await resolveCompanyId(companyIdOverride, control);
    if (!companyId) return { ok: false, err: null, permissionDenied: false };
    const id = control.id || (new Date().getTime().toString());
    const ref = doc(db, 'foretag', companyId, 'controls', id);
    // Normalize project shape: some older local items use `projectId` instead of `project: { id }`
    const projectObj = control.project || (control.projectId ? { id: control.projectId } : (control.project && control.project.id ? { id: control.project.id } : undefined));
    const payload = Object.assign({}, control, {
      companyId,
      project: projectObj,
      projectId: projectObj?.id || control.projectId || control.project?.id,
      savedAt: serverTimestamp()
    });
    const safePayload = sanitizeForFirestore(payload);
    try {
      await setDoc(ref, safePayload, { merge: true });
    } catch(e) {
      const permissionDenied = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      return { ok: false, err: e, permissionDenied };
    }
    // Also persist a local copy so the native app shows the item immediately
    try {
      const raw = await AsyncStorage.getItem('completed_controls');
      let arr = raw ? JSON.parse(raw) || [] : [];
      // avoid duplicate by id
      if (!arr.find(a => a && a.id === id)) {
        arr.push({ ...control, id, savedAt: new Date().toISOString() });
        await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      }
    } catch(_e) {
      // ignore local persist failures
    }
    return { ok: true, err: null, permissionDenied: false };
  }

  try {
    const first = await attemptWrite({ forceTokenRefresh: false });
    if (first.ok) return true;
    if (first.permissionDenied) {
      // Very common: custom claims were just set but the client token hasn't refreshed yet.
      const second = await attemptWrite({ forceTokenRefresh: true });
      if (second.ok) return true;
      throw second.err || first.err || new Error('permission-denied');
    }
    throw first.err;
  } catch(e) {
      // If Firestore rejects due to permission issues, persist locally and show a friendly alert
      const isPermissionError = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      try {
        const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
        let arr = rawArr ? JSON.parse(rawArr) : [];
        const debug = await getAuthDebugSnapshot();
        let resolvedCompanyId = null;
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, control); } catch(_e) {}
        const entry = {
          fn: 'saveControlToFirestore',
          code: e?.code || null,
          err: (e && e.message) ? e.message : String(e),
          full: (e && e.stack) ? e.stack : String(e),
          ts: new Date().toISOString(),
          id: control && control.id ? control.id : null,
          resolvedCompanyId,
          auth: debug,
        };
        arr.push(entry);
        await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
        // keep single "last" key for compatibility
        await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
      } catch(_e) {}

      if (isPermissionError) {
        // Save the control locally so the app doesn't lose data and can sync later
        try {
          const raw = await AsyncStorage.getItem('completed_controls');
          let arr = raw ? JSON.parse(raw) || [] : [];
          const id = control && control.id ? control.id : (new Date().getTime().toString());
          if (!arr.find(a => a && a.id === id)) {
            arr.push({ ...control, id, savedAt: new Date().toISOString() });
            await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
          }
        } catch(_e) {}

        // Show friendly user-facing message and warn in console (avoid raw console.error to reduce noisy UI logs)
        try {
          Alert.alert('Sparat lokalt', 'Kontrollen sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch(_e) {}
        console.warn('[firebase] saveControlToFirestore permission denied — saved locally');
        return false;
      }

      // Fallback for other error types
      console.error('[firebase] saveControlToFirestore error', e);
      return false;
    }
}

export async function saveDraftToFirestore(draft, companyIdOverride) {
  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (!draft) return { ok: false, err: null, permissionDenied: false };
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }
    const companyId = await resolveCompanyId(companyIdOverride, draft);
    if (!companyId) return { ok: false, err: null, permissionDenied: false };
    const id = draft.id || (new Date().getTime().toString());
    const ref = doc(db, 'foretag', companyId, 'draft_controls', id);
    const projectObj = draft.project || (draft.projectId ? { id: draft.projectId } : (draft.project && draft.project.id ? { id: draft.project.id } : undefined));
    const payload = Object.assign({}, draft, {
      companyId,
      project: projectObj,
      projectId: projectObj?.id || draft.projectId || draft.project?.id,
      savedAt: serverTimestamp()
    });
    const safePayload = sanitizeForFirestore(payload);
    try {
      await setDoc(ref, safePayload, { merge: true });
    } catch(e) {
      const permissionDenied = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      return { ok: false, err: e, permissionDenied };
    }
    // Also persist a local copy so native app retains the draft
    try {
      const raw = await AsyncStorage.getItem('draft_controls');
      let arr = raw ? JSON.parse(raw) || [] : [];
      const idx = arr.findIndex(a => a && a.id === id);
      if (idx !== -1) {
        arr[idx] = { ...draft, id, savedAt: new Date().toISOString() };
      } else {
        arr.push({ ...draft, id, savedAt: new Date().toISOString() });
      }
      await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
    } catch(_e) {
      // ignore local persist failures
    }
    return { ok: true, err: null, permissionDenied: false };
  }

  try {
    const first = await attemptWrite({ forceTokenRefresh: false });
    if (first.ok) return true;
    if (first.permissionDenied) {
      const second = await attemptWrite({ forceTokenRefresh: true });
      if (second.ok) return true;
      throw second.err || first.err || new Error('permission-denied');
    }
    throw first.err;
  } catch(e) {
      const isPermissionError = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      try {
        const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
        let arr = rawArr ? JSON.parse(rawArr) : [];
        const debug = await getAuthDebugSnapshot();
        let resolvedCompanyId = null;
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, draft); } catch(_e) {}
        const entry = {
          fn: 'saveDraftToFirestore',
          code: e?.code || null,
          err: (e && e.message) ? e.message : String(e),
          full: (e && e.stack) ? e.stack : String(e),
          ts: new Date().toISOString(),
          id: draft && draft.id ? draft.id : null,
          resolvedCompanyId,
          auth: debug,
        };
        arr.push(entry);
        await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
        // keep single "last" key for compatibility
        await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
      } catch(_e) {}

      if (isPermissionError) {
        // Save the draft locally so user doesn't lose work
        try {
          const raw = await AsyncStorage.getItem('draft_controls');
          let arr = raw ? JSON.parse(raw) || [] : [];
          const id = draft && draft.id ? draft.id : (new Date().getTime().toString());
          const idx = arr.findIndex(a => a && a.id === id);
          if (idx !== -1) {
            arr[idx] = { ...draft, id, savedAt: new Date().toISOString() };
          } else {
            arr.push({ ...draft, id, savedAt: new Date().toISOString() });
          }
          await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
        } catch(_e) {}

        try {
          Alert.alert('Sparat lokalt', 'Utkast sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch(_e) {}
        console.warn('[firebase] saveDraftToFirestore permission denied — saved locally');
        return false;
      }

      console.error('[firebase] saveDraftToFirestore error', e);
      return false;
    }
}

// Fetch controls for a single project from Firestore
export async function fetchControlsForProject(projectId, companyIdOverride) {
  if (!projectId) return [];
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const out = [];

    // Prefer querying on normalized projectId field
    try {
      const q1 = query(collection(db, 'foretag', companyId, 'controls'), where('projectId', '==', projectId));
      const snap1 = await getDocs(q1);
      snap1.forEach(docSnap => {
        const d = docSnap.data() || {};
        out.push(Object.assign({}, d, { id: docSnap.id }));
      });
    } catch(_e) {}

    // Backward compatibility: some items may have only project.id
    try {
      const q2 = query(collection(db, 'foretag', companyId, 'controls'), where('project.id', '==', projectId));
      const snap2 = await getDocs(q2);
      snap2.forEach(docSnap => {
        if (!out.find(x => x && x.id === docSnap.id)) {
          const d = docSnap.data() || {};
          out.push(Object.assign({}, d, { id: docSnap.id }));
        }
      });
    } catch(_e) {}

    return out;
  } catch(_e) {
    return [];
  }
}

// Fetch draft controls for a single project from Firestore
export async function fetchDraftControlsForProject(projectId, companyIdOverride) {
  if (!projectId) return [];
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const out = [];

    // Prefer querying on normalized projectId field
    try {
      const q1 = query(collection(db, 'foretag', companyId, 'draft_controls'), where('projectId', '==', projectId));
      const snap1 = await getDocs(q1);
      snap1.forEach(docSnap => {
        const d = docSnap.data() || {};
        out.push(Object.assign({}, d, { id: docSnap.id }));
      });
    } catch(_e) {}

    // Backward compatibility: some items may have only project.id
    try {
      const q2 = query(collection(db, 'foretag', companyId, 'draft_controls'), where('project.id', '==', projectId));
      const snap2 = await getDocs(q2);
      snap2.forEach(docSnap => {
        if (!out.find(x => x && x.id === docSnap.id)) {
          const d = docSnap.data() || {};
          out.push(Object.assign({}, d, { id: docSnap.id }));
        }
      });
    } catch(_e) {}

    return out;
  } catch(_e) {
    return [];
  }
}

export async function deleteDraftControlFromFirestore(draftId, companyIdOverride) {
  try {
    if (!draftId) return false;
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return false;
    await deleteDoc(doc(db, 'foretag', companyId, 'draft_controls', String(draftId)));
    return true;
  } catch(_e) {
    return false;
  }
}

export async function deleteControlFromFirestore(controlId, companyIdOverride) {
  try {
    if (!controlId) return false;
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return false;
    await deleteDoc(doc(db, 'foretag', companyId, 'controls', String(controlId)));
    return true;
  } catch(_e) {
    return false;
  }
}

// Byggdel-hierarki per företag
// Storage: foretag/{companyId}/byggdel_hierarki/state
// Shape: { momentsByGroup: { [huvudgrupp: string]: string[] }, updatedAt }
export async function fetchByggdelHierarchy(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return { momentsByGroup: {} };
    const ref = doc(db, 'foretag', companyId, 'byggdel_hierarki', 'state');
    const snap = await getDoc(ref);
    if (!snap.exists()) return { momentsByGroup: {} };
    const data = snap.data() || {};
    const momentsByGroup = (data && typeof data.momentsByGroup === 'object' && data.momentsByGroup) ? data.momentsByGroup : {};
    return { momentsByGroup };
  } catch(_e) {
    return { momentsByGroup: {} };
  }
}

export async function saveByggdelHierarchy({ momentsByGroup }, companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return false;
    const ref = doc(db, 'foretag', companyId, 'byggdel_hierarki', 'state');
    await setDoc(ref, { momentsByGroup: momentsByGroup || {}, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch(_e) {
    return false;
  }
}

// Default kontrolltyper (globala standarder) som alltid finns tillgängliga.
// Dessa kan kompletteras med företags-specifika kontrolltyper i
// /foretag/{companyId}/kontrolltyper.
export const DEFAULT_CONTROL_TYPES = [
  { key: 'arbetsberedning', name: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2', order: 10, builtin: true },
  { key: 'egenkontroll', name: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C', order: 20, builtin: true },
  { key: 'fuktmatning', name: 'Fuktmätning', icon: 'water-outline', color: '#0288D1', order: 30, builtin: true },
  { key: 'mottagningskontroll', name: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2', order: 40, builtin: true },
  { key: 'riskbedomning', name: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600', order: 50, builtin: true },
  { key: 'skyddsrond', name: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C', order: 60, builtin: true },
];

export async function fetchCompanyControlTypes(companyIdOverride) {
  const base = DEFAULT_CONTROL_TYPES.slice();
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) return base;
  try {
    const colRef = collection(db, 'foretag', companyId, 'kontrolltyper');
    const snap = await getDocs(colRef);
    const extras = [];
    snap.forEach((docSnap) => {
      try {
        const data = docSnap.data() || {};
        const key = String(data.key || docSnap.id || data.name || '').trim() || `ct_${docSnap.id}`;
        // Bygg en patch som bara innehåller de fält som faktiskt finns på dokumentet
        // så att vi inte råkar skriva över standardvärden (namn/ikon/färg) när en
        // override bara vill sätta t.ex. `hidden: true`.
        const patch = { key, builtin: false, id: docSnap.id };
        if (Object.prototype.hasOwnProperty.call(data, 'name') || Object.prototype.hasOwnProperty.call(data, 'title')) {
          const name = String(data.name || data.title || key).trim();
          if (name) patch.name = name;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'icon')) {
          const icon = String(data.icon || '').trim();
          if (icon) patch.icon = icon;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'color')) {
          const color = String(data.color || '').trim();
          if (color) patch.color = color;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'order') && typeof data.order === 'number' && Number.isFinite(data.order)) {
          patch.order = data.order;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'hidden')) {
          patch.hidden = !!data.hidden;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'foldersEnabled')) {
          patch.foldersEnabled = !!data.foldersEnabled;
        }
        extras.push(patch);
      } catch (_e) {}
    });
    if (!extras.length) return base;
    const byKey = new Map();
    base.forEach((t) => { byKey.set(String(t.key || t.name).toLowerCase(), t); });
    // Overlay företags-specifika overrides ovanpå defaulttyperna i stället
    // för att ersätta dem helt. På så sätt kan en override som bara sätter
    // t.ex. `hidden: true` återanvända defaultens namn, ikon och färg.
    extras.forEach((t) => {
      const k = String(t.key || t.name).toLowerCase();
      const existing = byKey.get(k) || {};
      byKey.set(k, { ...existing, ...t });
    });
    const merged = Array.from(byKey.values());
    merged.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 9999;
      const bo = typeof b.order === 'number' ? b.order : 9999;
      if (ao !== bo) return ao - bo;
      const an = String(a.name || '').toLowerCase();
      const bn = String(b.name || '').toLowerCase();
      return an.localeCompare(bn, 'sv');
    });
    return merged;
  } catch (_e) {
    return base;
  }
}

// Skapa en ny företags-specifik kontrolltyp under /foretag/{companyId}/kontrolltyper.
// Minimal payload: { name }. Optionellt: { key, icon, color, order }.
export async function createCompanyControlType(payload, companyIdOverride) {
  if (!payload || !payload.name) throw new Error('Namn på kontrolltyp saknas.');
  const companyId = await resolveCompanyId(companyIdOverride, payload);
  if (!companyId) throw new Error('Kunde inte avgöra företag för kontrolltypen.');
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Namn på kontrolltyp saknas.');
  const keyRaw = String(payload.key || '').trim();
  const key = keyRaw || name.toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  const icon = String(payload.icon || '').trim() || 'document-text-outline';
  const color = String(payload.color || '').trim() || '#455A64';
  const order = (typeof payload.order === 'number' && Number.isFinite(payload.order)) ? payload.order : null;
  try {
    const colRef = collection(db, 'foretag', companyId, 'kontrolltyper');
    const docRef = await addDoc(colRef, sanitizeForFirestore({
      key,
      name,
      icon,
      color,
      ...(order !== null ? { order } : {}),
      createdAt: serverTimestamp(),
    }));
    return { id: docRef.id, key, name, icon, color, order };
  } catch (e) {
    throw new Error(e?.message || 'Kunde inte skapa kontrolltyp.');
  }
}

// Uppdatera en befintlig företags-specifik kontrolltyp.
// Payload ska innehålla antingen { id } eller { key } och valfria fält att uppdatera: { name, icon, color, order, hidden }.
export async function updateCompanyControlType(payload, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, payload);
  if (!companyId) throw new Error('Kunde inte avgöra företag för kontrolltypen.');
  let docId = String(payload?.id || '').trim();
  if (!docId) {
    const keyRaw = String(payload?.key || '').trim();
    if (!keyRaw) throw new Error('ID eller nyckel för kontrolltyp saknas.');
    // Normalisera docId från key på samma sätt som createCompanyControlType gör för key.
    docId = keyRaw.toLowerCase().replace(/[^a-z0-9]+/gi, '-');
    if (!docId) throw new Error('Ogiltig nyckel för kontrolltyp.');
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('Namn på kontrolltyp saknas.');
    patch.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'icon')) {
    patch.icon = String(payload.icon || '').trim() || 'document-text-outline';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'color')) {
    patch.color = String(payload.color || '').trim() || '#455A64';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'order')) {
    if (typeof payload.order === 'number' && Number.isFinite(payload.order)) {
      patch.order = payload.order;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'hidden')) {
    patch.hidden = !!payload.hidden;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'foldersEnabled')) {
    patch.foldersEnabled = !!payload.foldersEnabled;
  }

  if (Object.keys(patch).length === 0) return true;

  patch.updatedAt = serverTimestamp();

  try {
    const ref = doc(db, 'foretag', companyId, 'kontrolltyper', docId);
    await setDoc(ref, sanitizeForFirestore(patch), { merge: true });
    return true;
  } catch (e) {
    throw new Error(e?.message || 'Kunde inte uppdatera kontrolltyp.');
  }
}

// Radera en företags-specifik kontrolltyp.
export async function deleteCompanyControlType(payload, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, payload);
  if (!companyId) throw new Error('Kunde inte avgöra företag för kontrolltypen.');
  const docId = String(payload?.id || '').trim();
  if (!docId) throw new Error('ID för kontrolltyp saknas.');
  try {
    const ref = doc(db, 'foretag', companyId, 'kontrolltyper', docId);
    await deleteDoc(ref);
    return true;
  } catch (e) {
    throw new Error(e?.message || 'Kunde inte radera kontrolltyp.');
  }
}

export async function fetchCompanyMallar(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const snap = await getDocs(collection(db, 'foretag', companyId, 'mallar'));
    const out = [];
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      out.push(Object.assign({}, d, { id: docSnap.id }));
    });
    out.sort((a, b) => {
      const at = String(a && (a.title ?? '')).trim();
      const bt = String(b && (b.title ?? '')).trim();
      return at.localeCompare(bt, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

// Kontrolltyp-mappar per företag
// Data model: foretag/{companyId}/kontrolltyp_mappar/{folderId}
// Fields: { controlType: string, name: string, order?: number, createdAt, updatedAt }
export async function fetchCompanyControlTypeFolders(companyIdOverride, controlType) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const ct = String(controlType || '').trim();
    if (!ct) return [];

    const colRef = collection(db, 'foretag', companyId, 'kontrolltyp_mappar');
    const q = query(colRef, where('controlType', '==', ct));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((docSnap) => {
      try {
        const d = docSnap.data() || {};
        out.push({ id: docSnap.id, ...d });
      } catch (_e) {}
    });
    out.sort((a, b) => {
      const ao = typeof a.order === 'number' && Number.isFinite(a.order) ? a.order : 9999;
      const bo = typeof b.order === 'number' && Number.isFinite(b.order) ? b.order : 9999;
      if (ao !== bo) return ao - bo;
      const an = String(a?.name || '').trim().toLowerCase();
      const bn = String(b?.name || '').trim().toLowerCase();
      return an.localeCompare(bn, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

export async function createCompanyControlTypeFolder({ controlType, name, order }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const ct = String(controlType || '').trim();
  const n = String(name || '').trim();
  if (!ct) throw new Error('controlType is required');
  if (!n) throw new Error('name is required');

  const colRef = collection(db, 'foretag', companyId, 'kontrolltyp_mappar');
  const payload = sanitizeForFirestore({
    controlType: ct,
    name: n,
    ...(typeof order === 'number' && Number.isFinite(order) ? { order } : {}),
    createdAt: serverTimestamp(),
  });
  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function updateCompanyControlTypeFolder({ id, patch }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const folderId = String(id || '').trim();
  if (!folderId) throw new Error('folder id is required');
  const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  safePatch.updatedAt = serverTimestamp();
  const ref = doc(db, 'foretag', companyId, 'kontrolltyp_mappar', folderId);
  await updateDoc(ref, sanitizeForFirestore(safePatch));
  return true;
}

export async function deleteCompanyControlTypeFolder({ id }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const folderId = String(id || '').trim();
  if (!folderId) throw new Error('folder id is required');
  await deleteDoc(doc(db, 'foretag', companyId, 'kontrolltyp_mappar', folderId));
  return true;
}

export async function createCompanyMall({ title, description, controlType, folderId, folderName, layout, version }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const t = String(title || '').trim();
  const desc = String(description || '').trim();
  const ct = String(controlType || '').trim();
  const fid = folderId === null || folderId === undefined ? null : String(folderId || '').trim();
  const fname = folderName === null || folderName === undefined ? null : String(folderName || '').trim();
  const layoutData = layout || null;
  const versionNumber = Number.isFinite(Number(version)) && Number(version) > 0 ? Number(version) : 1;
  let createdBy = null;
  try {
    const u = auth && auth.currentUser ? auth.currentUser : null;
    if (u) {
      createdBy = {
        uid: u.uid || null,
        email: u.email || null,
        displayName: u.displayName || null,
      };
    }
  } catch (_e) {
    createdBy = null;
  }
  if (!t) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  const colRef = collection(db, 'foretag', companyId, 'mallar');
  const payload = {
    title: t,
    description: desc,
    controlType: ct || null,
    folderId: fid || null,
    folderName: fname || null,
    layout: layoutData,
    createdBy: createdBy || null,
    hidden: false,
    version: versionNumber,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(colRef, payload);
  return docRef.id;
}

// Uppdatera en företagsmall (merge)
// Exempel: updateCompanyMall({ id, patch: { hidden: true } })
export async function updateCompanyMall({ id, patch }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const mallId = String(id || '').trim();
  if (!mallId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  safePatch.updatedAt = serverTimestamp();

  const ref = doc(db, 'foretag', companyId, 'mallar', mallId);
  await updateDoc(ref, safePatch);
  return true;
}

export async function deleteCompanyMall({ id }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const mallId = String(id || '').trim();
  if (!mallId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  await deleteDoc(doc(db, 'foretag', companyId, 'mallar', mallId));
  return true;
}

// Kontaktregister per företag
// Data model: foretag/{companyId}/kontakter/{contactId}
// Fields: { name, companyName (systemföretag), contactCompanyName (företag kontakten jobbar på), role, phone, email, createdAt, updatedAt, createdBy? }
export async function fetchCompanyContacts(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const snap = await getDocs(collection(db, 'foretag', companyId, 'kontakter'));
    const out = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      out.push({ ...d, id: docSnap.id });
    });
    out.sort((a, b) => {
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();
      return an.localeCompare(bn, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

// Superadmin: hämta kontakter från alla företag.
// Uses collectionGroup('kontakter') where docs live under foretag/{companyId}/kontakter/{contactId}
export async function fetchAllCompanyContacts({ max = 2000 } = {}) {
  try {
    const lim = Number.isFinite(max) ? Math.max(1, Math.min(10000, max)) : 2000;
    const q = query(collectionGroup(db, 'kontakter'), limit(lim));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((docSnap) => {
      try {
        const d = docSnap.data() || {};
        // Path: foretag/{companyId}/kontakter/{contactId}
        const companyId = docSnap?.ref?.parent?.parent?.id ? String(docSnap.ref.parent.parent.id) : '';
        out.push({ ...d, id: docSnap.id, companyId });
      } catch (_e) {
        // ignore single doc
      }
    });
    out.sort((a, b) => {
      const ac = String(a?.companyName || a?.companyId || '').trim();
      const bc = String(b?.companyName || b?.companyId || '').trim();
      const cn = ac.localeCompare(bc, 'sv');
      if (cn !== 0) return cn;
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();
      return an.localeCompare(bn, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

export async function createCompanyContact(
  { name, companyName, contactCompanyName, role, phone, email, linkedSupplierId, companyId: contactCompanyId, customerId, companyType },
  companyIdOverride
) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const n = String(name || '').trim();
  if (!n) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  const payload = {
    name: n,
    companyName: String(companyName || '').trim() || String(companyId || '').trim(), // Systemföretag som äger kontakten
    contactCompanyName: String(contactCompanyName || '').trim(), // Företag som kontakten jobbar på (kan vara externt)
    role: String(role || '').trim(),
    phone: String(phone || '').trim(),
    email: String(email || '').trim(),
    createdAt: serverTimestamp(),
  };
  if (contactCompanyId !== undefined) payload.companyId = contactCompanyId;
  if (customerId !== undefined) payload.customerId = customerId;
  if (companyType !== undefined) payload.companyType = companyType;
  if (linkedSupplierId !== undefined) {
    const ls = linkedSupplierId === null ? null : String(linkedSupplierId || '').trim();
    payload.linkedSupplierId = ls;
  }
  let createdBy = null;
  try {
    const u = auth && auth.currentUser ? auth.currentUser : null;
    if (u) {
      createdBy = {
        uid: u.uid || null,
        email: u.email || null,
        displayName: u.displayName || null,
      };
    }
  } catch (_e) {
    createdBy = null;
  }
  if (createdBy) payload.createdBy = createdBy;

  const colRef = collection(db, 'foretag', companyId, 'kontakter');
  const docRef = await addDoc(colRef, sanitizeForFirestore(payload));
  return docRef.id;
}

export async function updateCompanyContact({ id, patch }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const contactId = String(id || '').trim();
  if (!contactId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  if (Object.prototype.hasOwnProperty.call(safePatch, 'name')) {
    const n = String(safePatch.name || '').trim();
    if (!n) throw new Error('Namn är obligatoriskt.');
    safePatch.name = n;
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'companyName')) {
    safePatch.companyName = String(safePatch.companyName || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'contactCompanyName')) {
    safePatch.contactCompanyName = String(safePatch.contactCompanyName || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'role')) {
    safePatch.role = String(safePatch.role || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'phone')) {
    safePatch.phone = String(safePatch.phone || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'email')) {
    safePatch.email = String(safePatch.email || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'linkedSupplierId')) {
    safePatch.linkedSupplierId =
      safePatch.linkedSupplierId === null ? null : String(safePatch.linkedSupplierId || '').trim();
  }
  safePatch.updatedAt = serverTimestamp();

  const ref = doc(db, 'foretag', companyId, 'kontakter', contactId);
  await updateDoc(ref, sanitizeForFirestore(safePatch));
  return true;
}

export async function deleteCompanyContact({ id }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const contactId = String(id || '').trim();
  if (!contactId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  await deleteDoc(doc(db, 'foretag', companyId, 'kontakter', contactId));
  return true;
}

// Leverantörer per företag
// Data model: foretag/{companyId}/leverantorer/{supplierId}
// Fields: companyName, organizationNumber, address (gata), postalCode, city, category, byggdelTags[], contactIds[], createdAt, updatedAt
// (vatNumber deprecated – not written for new/updated docs)
export async function fetchCompanySuppliers(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const snap = await getDocs(collection(db, 'foretag', companyId, 'leverantorer'));
    const out = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      out.push({ ...d, id: docSnap.id });
    });
    out.sort((a, b) => {
      const an = String(a?.companyName || '').trim();
      const bn = String(b?.companyName || '').trim();
      return an.localeCompare(bn, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

export async function createCompanySupplier(
  { companyName, organizationNumber, address, postalCode, city, category, categories, byggdelTags, contactIds },
  companyIdOverride
) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const n = String(companyName || '').trim();
  if (!n) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  const payload = {
    companyName: n,
    organizationNumber: String(organizationNumber || '').trim(),
    address: String(address || '').trim(),
    postalCode: String(postalCode || '').trim(),
    city: String(city || '').trim(),
    category: String(category || '').trim(),
    createdAt: serverTimestamp(),
  };
  if (Array.isArray(categories)) {
    payload.categories = categories.map((c) => String(c || '').trim()).filter(Boolean);
    if (!payload.category && payload.categories.length) {
      payload.category = payload.categories[0];
    }
  }
  if (Array.isArray(byggdelTags) && byggdelTags.length > 0) {
    payload.byggdelTags = byggdelTags.map((t) => String(t || '').trim()).filter(Boolean);
  }
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    payload.contactIds = contactIds.map((id) => String(id || '').trim()).filter(Boolean);
  }
  let createdBy = null;
  try {
    const u = auth && auth.currentUser ? auth.currentUser : null;
    if (u) {
      createdBy = {
        uid: u.uid || null,
        email: u.email || null,
        displayName: u.displayName || null,
      };
    }
  } catch (_e) {
    createdBy = null;
  }
  if (createdBy) payload.createdBy = createdBy;

  const colRef = collection(db, 'foretag', companyId, 'leverantorer');
  const docRef = await addDoc(colRef, sanitizeForFirestore(payload));
  return docRef.id;
}

export async function updateCompanySupplier({ id, patch }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const supplierId = String(id || '').trim();
  if (!supplierId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  if (Object.prototype.hasOwnProperty.call(safePatch, 'companyName')) {
    const n = String(safePatch.companyName || '').trim();
    if (!n) throw new Error('Företagsnamn är obligatoriskt.');
    safePatch.companyName = n;
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'organizationNumber')) {
    safePatch.organizationNumber = String(safePatch.organizationNumber || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'address')) {
    safePatch.address = String(safePatch.address || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'postalCode')) {
    safePatch.postalCode = String(safePatch.postalCode || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'city')) {
    safePatch.city = String(safePatch.city || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'category')) {
    safePatch.category = String(safePatch.category || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'categories')) {
    safePatch.categories = Array.isArray(safePatch.categories)
      ? safePatch.categories.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    if (!safePatch.category && safePatch.categories.length) {
      safePatch.category = safePatch.categories[0];
    }
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'byggdelTags')) {
    safePatch.byggdelTags = Array.isArray(safePatch.byggdelTags)
      ? safePatch.byggdelTags.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'contactIds')) {
    safePatch.contactIds = Array.isArray(safePatch.contactIds)
      ? safePatch.contactIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
  }
  delete safePatch.vatNumber;
  safePatch.updatedAt = serverTimestamp();

  const ref = doc(db, 'foretag', companyId, 'leverantorer', supplierId);
  await updateDoc(ref, sanitizeForFirestore(safePatch));
  return true;
}

export async function deleteCompanySupplier({ id }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const supplierId = String(id || '').trim();
  if (!supplierId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  await deleteDoc(doc(db, 'foretag', companyId, 'leverantorer', supplierId));
  return true;
}

// Kunder per företag
// Data model: foretag/{companyId}/kunder/{customerId}
// Fields: name, personalOrOrgNumber, address (gata), postalCode, city, customerType, contactIds[], createdAt, updatedAt
export async function fetchCompanyCustomers(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const snap = await getDocs(collection(db, 'foretag', companyId, 'kunder'));
    const out = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      out.push({ ...d, id: docSnap.id });
    });
    out.sort((a, b) => {
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();
      return an.localeCompare(bn, 'sv');
    });
    return out;
  } catch (_e) {
    return [];
  }
}

export async function createCompanyCustomer(
  { name, personalOrOrgNumber, address, postalCode, city, customerType, contactIds },
  companyIdOverride
) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const n = String(name || '').trim();
  if (!n) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  const payload = {
    name: n,
    personalOrOrgNumber: String(personalOrOrgNumber || '').trim(),
    address: String(address || '').trim(),
    postalCode: String(postalCode || '').trim(),
    city: String(city || '').trim(),
    customerType: String(customerType || '').trim(),
    createdAt: serverTimestamp(),
  };
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    payload.contactIds = contactIds.map((id) => String(id || '').trim()).filter(Boolean);
  }
  let createdBy = null;
  try {
    const u = auth && auth.currentUser ? auth.currentUser : null;
    if (u) {
      createdBy = {
        uid: u.uid || null,
        email: u.email || null,
        displayName: u.displayName || null,
      };
    }
  } catch (_e) {
    createdBy = null;
  }
  if (createdBy) payload.createdBy = createdBy;

  const colRef = collection(db, 'foretag', companyId, 'kunder');
  const docRef = await addDoc(colRef, sanitizeForFirestore(payload));
  return docRef.id;
}

export async function updateCompanyCustomer({ id, patch }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const customerId = String(id || '').trim();
  if (!customerId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }

  const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  if (Object.prototype.hasOwnProperty.call(safePatch, 'name')) {
    const n = String(safePatch.name || '').trim();
    if (!n) throw new Error('Namn är obligatoriskt.');
    safePatch.name = n;
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'personalOrOrgNumber')) {
    safePatch.personalOrOrgNumber = String(safePatch.personalOrOrgNumber || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'address')) {
    safePatch.address = String(safePatch.address || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'postalCode')) {
    safePatch.postalCode = String(safePatch.postalCode || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'city')) {
    safePatch.city = String(safePatch.city || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'customerType')) {
    safePatch.customerType = String(safePatch.customerType || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'contactIds')) {
    safePatch.contactIds = Array.isArray(safePatch.contactIds)
      ? safePatch.contactIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
  }
  safePatch.updatedAt = serverTimestamp();

  const ref = doc(db, 'foretag', companyId, 'kunder', customerId);
  await updateDoc(ref, sanitizeForFirestore(safePatch));
  return true;
}

export async function deleteCompanyCustomer({ id }, companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, null);
  if (!companyId) {
    const err = new Error('no_company');
    err.code = 'no_company';
    throw err;
  }
  const customerId = String(id || '').trim();
  if (!customerId) {
    const err = new Error('invalid-argument');
    err.code = 'invalid-argument';
    throw err;
  }
  await deleteDoc(doc(db, 'foretag', companyId, 'kunder', customerId));
  return true;
}

// Byggdel mall-register per företag
// Data model: foretag/{companyId}/byggdel_mallar/{mallId} with fields:
// { huvudgrupp: string, moment: string, name: string, createdAt, updatedAt }
export async function fetchByggdelMallar(companyIdOverride) {
  try {
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) return [];
    const out = [];

    // Avoid multi-field orderBy here: it can require a composite index.
    // Fetch all mall docs and sort client-side for predictable UI ordering.
    const snap = await getDocs(collection(db, 'foretag', companyId, 'byggdel_mallar'));
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      out.push(Object.assign({}, d, { id: docSnap.id }));
    });

    out.sort((a, b) => {
      const ag = String(a && (a.huvudgrupp ?? '')).trim();
      const bg = String(b && (b.huvudgrupp ?? '')).trim();
      if (ag !== bg) return ag.localeCompare(bg, 'sv');

      const am = String(a && (a.moment ?? '')).trim();
      const bm = String(b && (b.moment ?? '')).trim();
      if (am !== bm) return am.localeCompare(bm, 'sv');

      const an = String(a && (a.name ?? '')).trim();
      const bn = String(b && (b.name ?? '')).trim();
      return an.localeCompare(bn, 'sv');
    });

    return out;
  } catch(_e) {
    return [];
  }
}

export async function createByggdelMall({ huvudgrupp, moment, name }, companyIdOverride) {
  function normalizeMallNameLower(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.replace(/\s+/g, ' ').toLowerCase();
  }

  function makeMallNameKey(nameLower) {
    const s = String(nameLower || '').trim();
    if (!s) return '';
    // Convert to a stable Firestore doc id
    // - remove diacritics (åäö -> aao)
    // - keep [a-z0-9-]
    let base = s;
    try {
      base = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch(_e) {
      // normalize may not exist in some environments; fall back
      base = s;
    }
    base = base
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
      .replace(/-+/g, '-');
    return base || '';
  }

  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }

    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) {
      const err = new Error('no_company');
      err.code = 'no_company';
      throw err;
    }
    const hg = String(huvudgrupp || '').trim();
    const mm = String(moment || '').trim();
    const nm = String(name || '').trim();
    if (!hg || !mm || !nm) {
      const err = new Error('invalid-argument');
      err.code = 'invalid-argument';
      throw err;
    }

    const nmLower = normalizeMallNameLower(nm);
    const nameKey = makeMallNameKey(nmLower);
    if (!nmLower || !nameKey) {
      const err = new Error('invalid-argument');
      err.code = 'invalid-argument';
      throw err;
    }

    const colRef = collection(db, 'foretag', companyId, 'byggdel_mallar');

    // Uniqueness per company (case-insensitive)
    // Must also cover older docs that may not have nameLower.
    const allSnap = await getDocs(colRef);
    let hasDuplicate = false;
    allSnap.forEach(docSnap => {
      const d = docSnap.data() || {};
      const existingLower = normalizeMallNameLower(d.nameLower || d.name || '');
      if (existingLower && existingLower === nmLower) hasDuplicate = true;
    });
    if (hasDuplicate) {
      const err = new Error('already-exists');
      err.code = 'already-exists';
      throw err;
    }

    const docRef = doc(db, 'foretag', companyId, 'byggdel_mallar', nameKey);
    const existingById = await getDoc(docRef);
    if (existingById.exists()) {
      const err = new Error('already-exists');
      err.code = 'already-exists';
      throw err;
    }

    const payload = {
      huvudgrupp: hg,
      moment: mm,
      name: nm,
      nameLower: nmLower,
      nameKey,
      points: [],
      sections: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(docRef, payload, { merge: false });
      return docRef.id;
    } catch(e) {
      const permissionDenied = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      if (permissionDenied) {
        const err = e || new Error('permission-denied');
        err.code = err.code || 'permission-denied';
        err.__permissionDenied = true;
        throw err;
      }
      throw e;
    }
  }

  try {
    return await attemptWrite({ forceTokenRefresh: false });
  } catch(e) {
    const isPermissionError = !!(e && (e.__permissionDenied === true || e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
    if (isPermissionError) {
      try {
        return await attemptWrite({ forceTokenRefresh: true });
      } catch(e2) {
        e = e2 || e;
      }
    }

    // Store debug info for troubleshooting (same pattern as other writes)
    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(_e) {}
      const entry = {
        fn: 'createByggdelMall',
        code: e?.code || null,
        err: (e && e.message) ? e.message : String(e),
        full: (e && e.stack) ? e.stack : String(e),
        ts: new Date().toISOString(),
        resolvedCompanyId,
        auth: debug,
      };
      arr.push(entry);
      await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
      await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
    } catch(_e) {}

    throw e;
  }
}

export async function deleteByggdelMall({ mallId }, companyIdOverride) {
  async function attemptDelete({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }

    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) {
      const err = new Error('no_company');
      err.code = 'no_company';
      throw err;
    }

    const id = String(mallId || '').trim();
    if (!id) {
      const err = new Error('invalid-argument');
      err.code = 'invalid-argument';
      throw err;
    }

    await deleteDoc(doc(db, 'foretag', companyId, 'byggdel_mallar', id));
    return true;
  }

  try {
    return await attemptDelete({ forceTokenRefresh: false });
  } catch(e) {
    const permissionDenied = !!(e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
    if (permissionDenied) {
      try {
        return await attemptDelete({ forceTokenRefresh: true });
      } catch(e2) {
        e = e2 || e;
      }
    }

    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(_e) {}
      const entry = {
        fn: 'deleteByggdelMall',
        code: e?.code || null,
        err: (e && e.message) ? e.message : String(e),
        full: (e && e.stack) ? e.stack : String(e),
        ts: new Date().toISOString(),
        resolvedCompanyId,
        auth: debug,
      };
      arr.push(entry);
      await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
      await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
    } catch(_e) {}

    throw e;
  }
}

// Update a Byggdel mall document (merge)
// Example: updateByggdelMall({ mallId, patch: { points: ['...'] } })
export async function updateByggdelMall({ mallId, patch }, companyIdOverride) {
  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(_e) {}
    }
    const companyId = await resolveCompanyId(companyIdOverride, null);
    if (!companyId) {
      const err = new Error('no_company');
      err.code = 'no_company';
      throw err;
    }
    const id = String(mallId || '').trim();
    if (!id) {
      const err = new Error('invalid-argument');
      err.code = 'invalid-argument';
      throw err;
    }

    const safePatch = sanitizeForFirestore(patch || {});
    const ref = doc(db, 'foretag', companyId, 'byggdel_mallar', id);
    try {
      await setDoc(ref, Object.assign({}, safePatch || {}, { updatedAt: serverTimestamp() }), { merge: true });
      return true;
    } catch(e) {
      const permissionDenied = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      if (permissionDenied) {
        const err = e || new Error('permission-denied');
        err.code = err.code || 'permission-denied';
        err.__permissionDenied = true;
        throw err;
      }
      throw e;
    }
  }

  try {
    const ok = await attemptWrite({ forceTokenRefresh: false });
    return ok;
  } catch(e) {
    const isPermissionError = !!(e && (e.__permissionDenied === true || e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
    if (isPermissionError) {
      try {
        return await attemptWrite({ forceTokenRefresh: true });
      } catch(e2) {
        e = e2 || e;
      }
    }

    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(_e) {}
      const entry = {
        fn: 'updateByggdelMall',
        code: e?.code || null,
        err: (e && e.message) ? e.message : String(e),
        full: (e && e.stack) ? e.stack : String(e),
        ts: new Date().toISOString(),
        mallId: String(mallId || '').trim() || null,
        resolvedCompanyId,
        auth: debug,
      };
      arr.push(entry);
      await AsyncStorage.setItem('dk_last_fs_errors', JSON.stringify(arr));
      await AsyncStorage.setItem('dk_last_fs_error', JSON.stringify(entry));
    } catch(_e) {}

    throw e;
  }
}

// ============================================================================
// PER-FAS SHAREPOINT KONFIGURATION
// ============================================================================

/**
 * Get SharePoint Site ID for a specific phase
 * Returns external site if configured, otherwise returns primary (fallback) site
 * @param {string} companyId - Company ID
 * @param {string} phaseKey - Phase key ('kalkylskede', 'produktion', 'avslut', 'eftermarknad')
 * @returns {Promise<{siteId: string, webUrl: string, isExternal: boolean, phaseKey: string, siteName?: string}>}
 */
export async function getSharePointSiteForPhase(companyId, phaseKey) {
  if (!companyId || !phaseKey) {
    throw new Error('Company ID and Phase Key are required');
  }

  try {
    // First, check if there's an external site configured for this phase
    const phaseConfigRef = doc(db, 'foretag', companyId, 'sharepoint_phases', phaseKey);
    const phaseConfigSnap = await getDoc(phaseConfigRef);
    
    if (phaseConfigSnap.exists()) {
      const phaseConfig = phaseConfigSnap.data();
      if (phaseConfig.enabled && phaseConfig.siteId) {
        return {
          siteId: phaseConfig.siteId,
          webUrl: phaseConfig.webUrl || null,
          isExternal: true,
          phaseKey: phaseKey,
          siteName: phaseConfig.siteName || null,
        };
      }
    }
    
    // Fallback to primary site
    const primarySiteId = await getCompanySharePointSiteId(companyId);
    if (!primarySiteId) {
      throw new Error(`No SharePoint site configured for company ${companyId}`);
    }
    
    const profile = await fetchCompanyProfile(companyId);
    return {
      siteId: primarySiteId,
      webUrl: profile?.sharePointWebUrl || null,
      isExternal: false,
      phaseKey: phaseKey,
      siteName: null,
    };
  } catch (error) {
    console.error('[getSharePointSiteForPhase] Error:', error);
    throw error;
  }
}

/**
 * Set external SharePoint site for a specific phase
 * @param {string} companyId - Company ID
 * @param {string} phaseKey - Phase key
 * @param {string} siteId - SharePoint Site ID
 * @param {string} [webUrl] - SharePoint Web URL
 * @param {string} [siteName] - Site display name
 * @returns {Promise<void>}
 */
export async function setSharePointSiteForPhase(companyId, phaseKey, siteId, webUrl = null, siteName = null) {
  if (!companyId || !phaseKey || !siteId) {
    throw new Error('Company ID, Phase Key, and Site ID are required');
  }

  try {
    const phaseConfigRef = doc(db, 'foretag', companyId, 'sharepoint_phases', phaseKey);
    await setDoc(phaseConfigRef, {
      enabled: true,
      siteId: siteId,
      webUrl: webUrl || null,
      siteName: siteName || null,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    
    console.log(`[setSharePointSiteForPhase] ✅ Set external SharePoint site for ${companyId}/${phaseKey}`);
  } catch (error) {
    console.error('[setSharePointSiteForPhase] Error:', error);
    throw error;
  }
}

/**
 * Remove external SharePoint site for a phase (revert to primary)
 * @param {string} companyId - Company ID
 * @param {string} phaseKey - Phase key
 * @returns {Promise<void>}
 */
export async function removeSharePointSiteForPhase(companyId, phaseKey) {
  if (!companyId || !phaseKey) {
    throw new Error('Company ID and Phase Key are required');
  }

  try {
    const phaseConfigRef = doc(db, 'foretag', companyId, 'sharepoint_phases', phaseKey);
    await updateDoc(phaseConfigRef, {
      enabled: false,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    
    console.log(`[removeSharePointSiteForPhase] ✅ Removed external SharePoint site for ${companyId}/${phaseKey}`);
  } catch (error) {
    console.error('[removeSharePointSiteForPhase] Error:', error);
    throw error;
  }
}

/**
 * Get SharePoint navigation configuration for a company
 * @param {string} companyIdOverride - Optional explicit company ID
 * @returns {Promise<Object>} Navigation configuration
 */
export async function getSharePointNavigationConfig(companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  try {
    const configRef = doc(db, 'foretag', companyId, 'sharepoint_navigation', 'config');
    const configSnap = await getDoc(configRef);
    
    if (configSnap.exists()) {
      return configSnap.data();
    }
    
    // Return default empty config
    return {
      enabledSites: [],
      siteConfigs: {},
      updatedAt: null,
      updatedBy: null,
    };
  } catch (error) {
    console.error('[getSharePointNavigationConfig] Error:', error);
    throw error;
  }
}

// ============================================================================
// SHAREPOINT PROJECT STRUCTURE (KALKYLSKEDE, LOCKED)
// ============================================================================

// Locked folder model for Kalkylskede projects.
// IMPORTANT: these folder names/prefixes must match UI ordering.
const KALKYLSKEDE_LOCKED_STRUCTURE_V1 = buildKalkylskedeLockedStructure(KALKYLSKEDE_STRUCTURE_VERSIONS.V1);
const KALKYLSKEDE_LOCKED_STRUCTURE_V2 = buildKalkylskedeLockedStructure(KALKYLSKEDE_STRUCTURE_VERSIONS.V2);

export function getKalkylskedeLockedRelativeFolderPaths(structureVersion = null) {
  const v = String(structureVersion || '').trim().toLowerCase();
  const structures =
    v === String(KALKYLSKEDE_STRUCTURE_VERSIONS.V2)
      ? [KALKYLSKEDE_LOCKED_STRUCTURE_V2]
      : v === String(KALKYLSKEDE_STRUCTURE_VERSIONS.V1)
      ? [KALKYLSKEDE_LOCKED_STRUCTURE_V1]
      : [KALKYLSKEDE_LOCKED_STRUCTURE_V1, KALKYLSKEDE_LOCKED_STRUCTURE_V2];

  const out = [];
  for (const structure of structures) {
    for (const section of structure) {
      if (!section?.name) continue;
      out.push(String(section.name));
      const items = Array.isArray(section.items) ? section.items : [];
      for (const itemName of items) {
        if (!itemName) continue;
        out.push(`${String(section.name)}/${String(itemName)}`);
      }
    }
  }
  return out;
}

export function normalizeSharePointPath(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

export function sanitizeSharePointFolderName(name) {
  // SharePoint folder names cannot contain: " # % & * : < > ? / \ { | } ~
  // We keep it conservative and just remove the most common illegal characters.
  return String(name || '')
    .replace(/[\\\/\:\*\?\"\<\>\|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatSharePointProjectFolderName(projectNumber, projectName) {
  const num = sanitizeSharePointFolderName(String(projectNumber || '').trim());
  const name = sanitizeSharePointFolderName(String(projectName || '').trim());
  const left = num || '';
  const right = name || '';
  if (left && right) return `${left} – ${right}`;
  return left || right || '';
}

export function isLockedKalkylskedeSharePointFolderPath({ projectRootPath, itemPath, structureVersion = null }) {
  const root = normalizeSharePointPath(projectRootPath);
  const path = normalizeSharePointPath(itemPath);
  if (!root || !path) return false;

  // Lock the project root folder itself.
  if (path === root) return true;

  if (!path.startsWith(`${root}/`)) return false;
  const rel = path.slice(root.length + 1); // remove root + '/'
  if (!rel) return true;

  const lockedRel = getKalkylskedeLockedRelativeFolderPaths(structureVersion);
  return lockedRel.includes(rel);
}

// ============================================================================
// SHAREPOINT PROJECT METADATA (phase/structure)
// ============================================================================

// SharePoint list/library metadata fields (used by Word/Excel templates via Document Properties/Quick Parts)
export const SHAREPOINT_PROJECT_PROPERTIES_FIELDS = {
  ProjectNumber: 'ProjectNumber',
  ProjectName: 'ProjectName',
};

/**
 * Update SharePoint Project Properties (library metadata) for the project root folder.
 *
 * Goals:
 * - Firestore remains source of truth for projectNumber/projectName
 * - SharePoint folder metadata is updated so Word/Excel documents can insert these
 *   values via Document Properties / Quick Parts without hardcoding.
 * - Does NOT rewrite any files.
 */
export async function updateSharePointProjectPropertiesFromFirestoreProject(companyIdOverride, project) {
  const companyId = await resolveCompanyId(companyIdOverride, project || { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const safeText = (v) => String(v || '').trim();
  const siteId = safeText(project?.sharePointSiteId || project?.siteId || project?.siteID);
  let projectPath = safeText(project?.rootFolderPath || project?.sharePointRootPath || project?.projectPath || project?.path);
  const pn = safeText(project?.projectNumber || project?.number || project?.id);
  const pnm = safeText(project?.projectName || project?.name);
  if (!siteId) throw new Error('Missing SharePoint siteId on project');

  if (!projectPath) {
    // Best-effort: resolve the folder by searching in SharePoint
    try {
      const { resolveProjectRootFolderPath } = await import('../services/azure/fileService');
      projectPath = await resolveProjectRootFolderPath({
        siteId,
        projectNumber: pn,
        projectName: pnm,
        fullName: safeText(project?.fullName),
      });
    } catch (e) {
      const err = new Error(`Kunde inte hitta projektmappen i SharePoint för att uppdatera metadata: ${e?.message || e}`);
      err.cause = e;
      throw err;
    }
  }

  const fields = {
    [SHAREPOINT_PROJECT_PROPERTIES_FIELDS.ProjectNumber]: pn || null,
    [SHAREPOINT_PROJECT_PROPERTIES_FIELDS.ProjectName]: pnm || null,
  };

  const { patchDriveItemListItemFieldsByPath } = await import('../services/azure/fileService');
  return await patchDriveItemListItemFieldsByPath({ siteId, path: projectPath, fields });
}

function encodeSharePointProjectMetaId(siteId, projectPath) {
  const sid = String(siteId || '').trim();
  const p = String(projectPath || '').trim();
  return encodeURIComponent(`${sid}|${p}`);
}

/**
 * Persist metadata for a SharePoint-backed project folder.
 * Used to show phase/structure indicators in the UI.
 *
 * Collection: foretag/{companyId}/sharepoint_project_metadata/{docId}
 */
export async function saveSharePointProjectMetadata(companyIdOverride, meta) {
  const companyId = await resolveCompanyId(companyIdOverride, meta);
  if (!companyId) throw new Error('Company ID is required');
  const siteId = String(meta?.siteId || '').trim();
  const projectPath = String(meta?.projectPath || '').trim();
  if (!siteId || !projectPath) throw new Error('siteId and projectPath are required');

  const docId = encodeSharePointProjectMetaId(siteId, projectPath);
  const ref = doc(db, 'foretag', companyId, 'sharepoint_project_metadata', docId);

  const payload = {
    siteId,
    projectPath,
    driveId: meta?.driveId != null ? String(meta.driveId) : null,
    folderId: meta?.folderId != null ? String(meta.folderId) : null,
    projectNumber: meta?.projectNumber != null ? String(meta.projectNumber) : null,
    projectName: meta?.projectName != null ? String(meta.projectName) : null,
    phaseKey: meta?.phaseKey != null ? String(meta.phaseKey) : null,
    structureType: meta?.structureType != null ? String(meta.structureType) : null,
    status: meta?.status != null ? String(meta.status) : null,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  };

  await setDoc(ref, sanitizeForFirestore(payload), { merge: true });
  return { id: docId, ...payload };
}

/**
 * Patch (partial update) for a SharePoint-backed project metadata doc.
 * Only fields explicitly provided are written (others are left untouched).
 */
export async function patchSharePointProjectMetadata(companyIdOverride, meta) {
  const companyId = await resolveCompanyId(companyIdOverride, meta);
  if (!companyId) throw new Error('Company ID is required');
  const siteId = String(meta?.siteId || '').trim();
  const projectPath = String(meta?.projectPath || '').trim();
  if (!siteId || !projectPath) throw new Error('siteId and projectPath are required');

  const docId = encodeSharePointProjectMetaId(siteId, projectPath);
  const ref = doc(db, 'foretag', companyId, 'sharepoint_project_metadata', docId);

  const payload = {
    siteId,
    projectPath,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  };

  if ('driveId' in meta) {
    payload.driveId = meta?.driveId != null ? String(meta.driveId) : null;
  }
  if ('folderId' in meta) {
    payload.folderId = meta?.folderId != null ? String(meta.folderId) : null;
  }

  if ('projectNumber' in meta) {
    payload.projectNumber = meta?.projectNumber != null ? String(meta.projectNumber) : null;
  }
  if ('projectName' in meta) {
    payload.projectName = meta?.projectName != null ? String(meta.projectName) : null;
  }
  if ('phaseKey' in meta) {
    payload.phaseKey = meta?.phaseKey != null ? String(meta.phaseKey) : null;
  }
  if ('structureType' in meta) {
    payload.structureType = meta?.structureType != null ? String(meta.structureType) : null;
  }
  if ('status' in meta) {
    payload.status = meta?.status != null ? String(meta.status) : null;
  }

  await setDoc(ref, sanitizeForFirestore(payload), { merge: true });
  return { id: docId, ...payload };
}

/**
 * Fetch all saved SharePoint project metadata for a company.
 * Returns a map keyed by `${siteId}|${projectPath}`.
 */
export async function fetchSharePointProjectMetadataMap(companyIdOverride) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const colRef = collection(db, 'foretag', companyId, 'sharepoint_project_metadata');
  const snap = await getDocs(colRef);
  const out = new Map();

  snap.forEach((docSnap) => {
    try {
      const d = docSnap.data() || {};
      const sid = String(d.siteId || '').trim();
      const p = String(d.projectPath || '').trim();
      if (!sid || !p) return;
      out.set(`${sid}|${p}`, { id: docSnap.id, ...d });
    } catch (_e) {}
  });

  return out;
}

// ============================================================================
// PROJECTS (Firestore source of truth)
// ============================================================================

function normalizeProjectNumberForUniqueness(value) {
  return String(value || '').trim().toLowerCase();
}

function projectNumberIndexDocIdFromNormalized(normalized) {
  const n = String(normalized || '').trim();
  if (!n) return '';
  // Doc IDs cannot contain '/'. encodeURIComponent is stable and safe.
  return encodeURIComponent(n);
}

function duplicateProjectNumberMessage(projectNumber) {
  const x = String(projectNumber || '').trim();
  return `Det finns redan ett projekt med projektnummer ${x}. Projektnummer måste vara unikt.`;
}

function createDuplicateProjectNumberError(projectNumber) {
  const err = new Error(duplicateProjectNumberMessage(projectNumber));
  err.name = 'DuplicateProjectNumberError';
  err.status = 409;
  err.code = 'conflict';
  return err;
}

/**
 * Shared helper: check if a projectNumber is already in use within the company.
 * - Trim + case-insensitive
 * - Excludes a projectId when editing
 */
export async function hasDuplicateProjectNumber(companyIdOverride, projectNumber, excludeProjectId) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const raw = String(projectNumber || '').trim();
  const normalized = normalizeProjectNumberForUniqueness(raw);
  if (!normalized) return false;

  const excluded = excludeProjectId != null ? String(excludeProjectId || '').trim() : '';

  // Fast path: check the uniqueness index doc.
  try {
    const idxId = projectNumberIndexDocIdFromNormalized(normalized);
    if (idxId) {
      const idxRef = doc(db, 'foretag', companyId, 'project_number_index', idxId);
      const idxSnap = await getDoc(idxRef);
      if (idxSnap.exists()) {
        const d = idxSnap.data() || {};
        const owner = String(d?.projectId || '').trim();
        if (!excluded || owner !== excluded) return true;
      }
    }
  } catch (_e) {
    // Non-fatal: fall back to collection scan below.
  }

  // Medium path: query any docs that already have normalized fields.
  try {
    const colRef = collection(db, 'foretag', companyId, 'projects');
    const q = query(colRef, where('projectNumberNormalized', '==', normalized));
    const snap = await getDocs(q);
    let dup = false;
    snap.forEach((docSnap) => {
      const pid = String(docSnap.id || '').trim();
      if (excluded && pid === excluded) return;
      dup = true;
    });
    if (dup) return true;
  } catch (_e) {
    // Non-fatal: fall back to full scan.
  }

  // Last-resort: full scan of company projects (ensures correctness for legacy data).
  // This is heavier, but avoids letting duplicates slip through when older docs
  // lack normalized/index fields.
  const colRef = collection(db, 'foretag', companyId, 'projects');
  const snap = await getDocs(colRef);
  let dup = false;
  snap.forEach((docSnap) => {
    const pid = String(docSnap.id || '').trim();
    if (excluded && pid === excluded) return;
    const d = docSnap.data() || {};
    const pn = String(d?.projectNumber || d?.number || pid || '').trim();
    if (!pn) return;
    if (normalizeProjectNumberForUniqueness(pn) === normalized) dup = true;
  });
  return dup;
}

/**
 * Upsert a project document in Firestore.
 * Collection: foretag/{companyId}/projects/{projectId}
 */
export async function upsertCompanyProject(companyIdOverride, projectId, data) {
  const companyId = await resolveCompanyId(companyIdOverride, data || { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const pid = String(projectId || data?.id || data?.projectId || data?.projectNumber || '').trim();
  if (!pid) throw new Error('projectId is required');

  const ref = doc(db, 'foretag', companyId, 'projects', pid);

  const rawStatus = String(data?.status != null ? data.status : '').trim().toLowerCase();
  // Locked model: lifecycle status is only 'active' | 'archived'.
  // Anything else is coerced to 'active' for backwards compatibility.
  const lifecycleStatus = rawStatus === 'archived' ? 'archived' : 'active';

  const payload = {
    id: pid,
    projectId: pid,
    projectNumber: data?.projectNumber != null ? String(data.projectNumber) : pid,
    projectNumberNormalized: null,
    projectNumberIndexId: null,
    projectName: data?.projectName != null ? String(data.projectName) : null,
    fullName: data?.fullName != null ? String(data.fullName) : null,
    // Lifecycle status (source of truth)
    status: lifecycleStatus,
    phase: data?.phase != null ? String(data.phase) : null,

    // Required SharePoint linkage
    sharePointSiteId: data?.sharePointSiteId != null ? String(data.sharePointSiteId) : null,
    sharePointSiteUrl: data?.sharePointSiteUrl != null ? String(data.sharePointSiteUrl) : null,
    rootFolderPath: data?.rootFolderPath != null ? String(data.rootFolderPath) : null,
    // Alias / future-proof name (kept in sync with rootFolderPath when provided)
    sharePointRootPath:
      data?.sharePointRootPath != null
        ? String(data.sharePointRootPath)
        : (data?.rootFolderPath != null ? String(data.rootFolderPath) : null),
    siteRole: data?.siteRole != null ? String(data.siteRole) : 'projects',

    // Optional robust linkage for ID-based delete
    sharePointDriveId: data?.sharePointDriveId != null ? String(data.sharePointDriveId) : (data?.driveId != null ? String(data.driveId) : null),
    sharePointFolderId: data?.sharePointFolderId != null ? String(data.sharePointFolderId) : (data?.folderId != null ? String(data.folderId) : null),

    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  };

  const rawPn = String(payload.projectNumber || '').trim();
  const normalizedPn = normalizeProjectNumberForUniqueness(rawPn);
  payload.projectNumber = rawPn || pid;
  payload.projectNumberNormalized = normalizedPn || null;

  const idxId = normalizedPn ? projectNumberIndexDocIdFromNormalized(normalizedPn) : '';
  payload.projectNumberIndexId = idxId || null;

  // Enforce projectNumber uniqueness per company via a transaction-based index.
  await runTransaction(db, async (tx) => {
    const projectSnap = await tx.get(ref);
    const prev = projectSnap.exists() ? (projectSnap.data() || {}) : {};
    const prevPnRaw = String(prev?.projectNumber || prev?.number || pid || '').trim();
    const prevPnNorm = normalizeProjectNumberForUniqueness(prevPnRaw);

    if (!normalizedPn) {
      throw new Error('Projektnummer är obligatoriskt');
    }

    if (!idxId) {
      throw new Error('Ogiltigt projektnummer');
    }

    const idxRef = doc(db, 'foretag', companyId, 'project_number_index', idxId);
    const idxSnap = await tx.get(idxRef);
    if (idxSnap.exists()) {
      const d = idxSnap.data() || {};
      const owner = String(d?.projectId || '').trim();
      if (owner && owner !== pid) {
        throw createDuplicateProjectNumberError(rawPn);
      }
    }

    // If doc doesn't exist yet, set createdAt/createdBy.
    const createdAt = data?.createdAt || serverTimestamp();
    const createdBy = data?.createdBy || auth.currentUser?.uid || null;

    tx.set(
      ref,
      sanitizeForFirestore({
        ...payload,
        ...(projectSnap.exists() ? {} : { createdAt, createdBy }),
      }),
      { merge: true }
    );

    tx.set(
      idxRef,
      sanitizeForFirestore({
        projectId: pid,
        projectNumber: rawPn,
        normalized: normalizedPn,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }),
      { merge: true }
    );

    // If number changed, release the previous index (best-effort; only if we own it).
    if (prevPnNorm && prevPnNorm !== normalizedPn) {
      const prevIdxId = projectNumberIndexDocIdFromNormalized(prevPnNorm);
      if (prevIdxId) {
        const prevIdxRef = doc(db, 'foretag', companyId, 'project_number_index', prevIdxId);
        const prevIdxSnap = await tx.get(prevIdxRef);
        if (prevIdxSnap.exists()) {
          const d = prevIdxSnap.data() || {};
          const owner = String(d?.projectId || '').trim();
          if (owner && owner === pid) {
            tx.delete(prevIdxRef);
          }
        }
      }
    }
  });

  return { id: pid, ...payload };
}

/**
 * Patch a project document without overwriting unrelated fields.
 * Collection: foretag/{companyId}/projects/{projectId}
 */
export async function patchCompanyProject(companyIdOverride, projectId, patch) {
  const companyId = await resolveCompanyId(companyIdOverride, patch || { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');

  const ref = doc(db, 'foretag', companyId, 'projects', pid);

  const incoming = (patch && typeof patch === 'object') ? { ...patch } : {};
  // Never allow callers to set this directly; we compute it.
  if (Object.prototype.hasOwnProperty.call(incoming, 'projectNumberNormalized')) {
    delete incoming.projectNumberNormalized;
  }

  const touchesProjectNumber =
    Object.prototype.hasOwnProperty.call(incoming, 'projectNumber') ||
    Object.prototype.hasOwnProperty.call(incoming, 'number');

  if (!touchesProjectNumber) {
    const payload = {
      ...incoming,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    };
    await updateDoc(ref, sanitizeForFirestore(payload));
    return { id: pid, ...payload };
  }

  const desiredRaw = Object.prototype.hasOwnProperty.call(incoming, 'projectNumber')
    ? String(incoming.projectNumber || '').trim()
    : (Object.prototype.hasOwnProperty.call(incoming, 'number') ? String(incoming.number || '').trim() : '');
  const desiredNorm = normalizeProjectNumberForUniqueness(desiredRaw);
  const desiredIdxId = desiredNorm ? projectNumberIndexDocIdFromNormalized(desiredNorm) : '';

  const payload = {
    ...incoming,
    projectNumber: desiredRaw,
    // Keep the common alias in sync if it was included by callers.
    ...(Object.prototype.hasOwnProperty.call(incoming, 'number') ? { number: desiredRaw } : {}),
    projectNumberNormalized: desiredNorm || null,
    projectNumberIndexId: desiredIdxId || null,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  };

  // If projectNumber is being changed, enforce uniqueness via transaction-based index.
  await runTransaction(db, async (tx) => {
    const projectSnap = await tx.get(ref);
    if (!projectSnap.exists()) {
      throw new Error('Projektet finns inte längre. Ladda om och försök igen.');
    }

    const prev = projectSnap.data() || {};
    const prevPnRaw = String(prev?.projectNumber || prev?.number || pid || '').trim();
    const prevPnNorm = normalizeProjectNumberForUniqueness(prevPnRaw);

    if (!desiredNorm) {
      throw new Error('Projektnummer är obligatoriskt');
    }

    if (!desiredIdxId) {
      throw new Error('Ogiltigt projektnummer');
    }

    const idxRef = doc(db, 'foretag', companyId, 'project_number_index', desiredIdxId);
    const idxSnap = await tx.get(idxRef);
    if (idxSnap.exists()) {
      const d = idxSnap.data() || {};
      const owner = String(d?.projectId || '').trim();
      if (owner && owner !== pid) {
        throw createDuplicateProjectNumberError(desiredRaw);
      }
    }

    tx.set(ref, sanitizeForFirestore(payload), { merge: true });
    tx.set(
      idxRef,
      sanitizeForFirestore({
        projectId: pid,
        projectNumber: desiredRaw,
        normalized: desiredNorm,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }),
      { merge: true }
    );

    if (prevPnNorm && prevPnNorm !== desiredNorm) {
      const prevIdxId = projectNumberIndexDocIdFromNormalized(prevPnNorm);
      if (prevIdxId) {
        const prevIdxRef = doc(db, 'foretag', companyId, 'project_number_index', prevIdxId);
        const prevIdxSnap = await tx.get(prevIdxRef);
        if (prevIdxSnap.exists()) {
          const d = prevIdxSnap.data() || {};
          const owner = String(d?.projectId || '').trim();
          if (owner && owner === pid) {
            tx.delete(prevIdxRef);
          }
        }
      }
    }
  });

  return { id: pid, ...payload };
}

/**
 * Fetch a single project doc.
 * Collection: foretag/{companyId}/projects/{projectId}
 */
export async function fetchCompanyProject(companyIdOverride, projectId) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');
  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');

  const ref = doc(db, 'foretag', companyId, 'projects', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return { id: snap.id, ...d };
}

// ============================================================================
// PROJECT TIMELINE (important dates)
// ============================================================================

function isValidIsoDateLight(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function projectInfoMilestoneId(key) {
  const k = String(key || '').trim();
  if (!k) return null;
  return `projectinfo:${k}`;
}

function projectInfoSourceKeyToProjectField(sourceKey) {
  const k = String(sourceKey || '').trim();
  if (!k) return null;
  // Canonical project fields (required): keep timeline in sync with Projektinformation master.
  if (k === 'sista-dag-for-fragor') return 'lastQuestionDate';
  if (k === 'anbudsinlamning') return 'tenderSubmissionDate';
  if (k === 'planerad-byggstart') return 'plannedConstructionStart';
  if (k === 'klart-for-besiktning') return 'readyForInspectionDate';
  return null;
}

/**
 * Two-way sync support:
 * If a Projektinformation-sourced milestone has been unlocked in the timeline,
 * changing the date in the timeline should update the corresponding
 * Projektinformation field (and legacy keys where relevant).
 */
export async function updateProjectInfoImportantDateFromTimeline(companyIdOverride, projectId, sourceKey, date) {
  const field = projectInfoSourceKeyToProjectField(sourceKey);
  if (!field) throw new Error('Unknown sourceKey');

  const iso = isValidIsoDateLight(date) ? String(date).trim() : '';
  const patch = { [field]: iso };

  // Keep Swedish keys in sync for existing UI/logic.
  if (field === 'lastQuestionDate') patch.sistaDagForFragor = iso;
  if (field === 'tenderSubmissionDate') patch.anbudsinlamning = iso;
  if (field === 'plannedConstructionStart') patch.planeradByggstart = iso;
  if (field === 'readyForInspectionDate') patch.klartForBesiktning = iso;

  // Backwards-compatibility mirrors (best effort).
  if (field === 'tenderSubmissionDate') patch.anbudstid = iso;
  if (field === 'plannedConstructionStart') patch.byggstart = iso;
  if (field === 'readyForInspectionDate') patch.fardigstallning = iso;

  await patchCompanyProject(companyIdOverride, projectId, patch);
  return { field, iso, patch };
}

/**
 * Upsert (or remove) a locked milestone date in project timeline.
 * One-way source of truth: Projektinformation.
 *
 * Storage:
 * foretag/{companyId}/project_timeline/{projectId}
 *
 * Behavior:
 * - Uses deterministic id: `projectinfo:${key}` to avoid duplicates
 * - If `date` is empty/invalid => removes that milestone from timeline
 */
export async function upsertProjectInfoTimelineMilestone(companyIdOverride, projectId, { key, title, date } = {}) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');

  const milestoneKey = String(key || '').trim();
  const id = projectInfoMilestoneId(milestoneKey);
  if (!id) throw new Error('key is required');

  const safeTitle = String(title || '').trim() || milestoneKey;
  const iso = isValidIsoDateLight(date) ? String(date).trim() : '';

  const ref = doc(db, 'foretag', companyId, 'project_timeline', pid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data() || {}) : {};
    const existingCustom = Array.isArray(current.customDates) ? current.customDates : [];

    const existingItem = existingCustom.find((d) => String(d?.id || '').trim() === id) || null;
    const filtered = existingCustom.filter((d) => String(d?.id || '').trim() !== id);
    const nextCustom = [...filtered];

    if (iso) {
      // Preserve user-edited fields (title/description/participants/etc) and unlock state.
      // New items default to locked (date is controlled by Projektinformation).
      const prevLocked = existingItem && typeof existingItem.locked === 'boolean' ? existingItem.locked : undefined;
      const nextLocked = prevLocked === false ? false : true;

      const prevTitle = existingItem ? String(existingItem?.title || '').trim() : '';
      const prevType = existingItem ? String(existingItem?.type || existingItem?.customType || '').trim() : '';

      nextCustom.push({
        ...(existingItem && typeof existingItem === 'object' ? existingItem : {}),
        id,
        date: iso,
        title: prevTitle || safeTitle,
        type: prevType || 'Viktigt datum',
        customType: String(existingItem?.customType || '').trim() || 'Viktigt datum',
        source: 'projectinfo',
        sourceKey: milestoneKey,
        locked: nextLocked,
      });
    }

    const payload = {
      projectId: pid,
      customDates: nextCustom,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    };

    tx.set(ref, sanitizeForFirestore(payload), { merge: true });
    return true;
  });
}

// ============================================================================
// PROJECT ORGANISATION (groups & members)
// ============================================================================

/**
 * Ensure a default internal main group exists for a project.
 *
 * Requirements:
 * - Create automatically (no user interaction)
 * - Group title equals company name (exact)
 * - Classified as internal main group
 * - Must NOT be renameable or deletable (enforced in UI + best-effort in hook)
 * - Create once per project
 * - If the company group already exists (by id/flag/title), reuse it
 *
 * Storage:
 * foretag/{companyId}/project_organisation/{projectId}
 */
export async function ensureDefaultProjectOrganisationGroup(companyIdOverride, projectId, { companyName } = {}) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');

  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');

  const title = String(companyName || '').trim() || String(companyId).trim();
  const ref = doc(db, 'foretag', companyId, 'project_organisation', pid);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data() || {}) : {};
    const rawGroups = current?.groups;
    const groups = Array.isArray(rawGroups)
      ? [...rawGroups]
      : (rawGroups && typeof rawGroups === 'object'
        ? Object.keys(rawGroups)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => rawGroups[k])
        : []);

    const norm = (v) => String(v || '').trim().toLowerCase();

    // Find an existing company group to reuse.
    // Priority:
    // 1) explicit id "internal-main"
    // 2) flagged internal main group
    // 3) group title matches company title
    let idx = groups.findIndex((g) => String(g?.id || '').trim() === 'internal-main');
    if (idx < 0) idx = groups.findIndex((g) => g?.isInternalMainGroup === true);
    if (idx < 0) idx = groups.findIndex((g) => norm(g?.title) === norm(title));

    const makeCompanyGroup = (base) => ({
      ...(base && typeof base === 'object' ? base : null),
      id: String(base?.id || '').trim() || 'internal-main',
      title,
      members: Array.isArray(base?.members) ? base.members : [],
      groupType: 'internal',
      isInternalMainGroup: true,
      locked: true,
    });

    let created = false;
    let updated = false;

    if (idx >= 0) {
      const before = groups[idx] || {};
      const next = makeCompanyGroup(before);

      // Only treat it as an update if anything important changed.
      if (
        String(before?.title || '').trim() !== String(next.title || '').trim() ||
        before?.locked !== true ||
        before?.isInternalMainGroup !== true ||
        String(before?.groupType || '').trim() !== 'internal'
      ) {
        groups[idx] = next;
        updated = true;
      }
    } else {
      groups.push(makeCompanyGroup(null));
      created = true;
      updated = true;
    }

    if (!updated) {
      return { ok: true, created: false, updated: false, skipped: true, reason: 'already_ok' };
    }

    tx.set(
      ref,
      sanitizeForFirestore({
        projectId: pid,
        groups,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
        createdAt: current?.createdAt || serverTimestamp(),
        createdBy: current?.createdBy || auth.currentUser?.uid || null,
      }),
      { merge: true }
    );

    const ensuredId = idx >= 0 ? String(groups[idx]?.id || '').trim() : 'internal-main';
    return { ok: true, created, updated, skipped: false, groupId: ensuredId };
  });
}

/**
 * Archive a project (soft delete).
 * - Updates Firestore project doc: status='archived', archivedAt, archivedBy
 * - Moves SharePoint folder from DK Site (role=projects) to DK Bas (role=system) under:
 *   /Arkiv/Projekt/{projektnamn}
 */
export async function archiveCompanyProject(companyIdOverride, projectId) {
  const companyId = await resolveCompanyId(companyIdOverride, { companyId: companyIdOverride });
  if (!companyId) throw new Error('Company ID is required');
  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId is required');

  const ref = doc(db, 'foretag', companyId, 'projects', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Project not found');
  const project = snap.data() || {};

  const curStatus = String(project?.status || '').trim().toLowerCase();
  if (curStatus === 'archived') {
    return { ok: true, alreadyArchived: true };
  }

  const sourceSiteId = String(project?.sharePointSiteId || '').trim();
  const sourcePath = String(project?.rootFolderPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const projectNumber = String(project?.projectNumber || project?.number || pid).trim() || pid;
  const projectTitle = String(project?.projectName || project?.name || '').trim();
  const projectName = projectTitle ? `${projectNumber} – ${projectTitle}` : projectNumber;

  // Update Firestore first so left panel hides it immediately and self-heal won’t recreate it.
  await updateDoc(ref, {
    status: 'archived',
    archivedAt: serverTimestamp(),
    archivedBy: auth.currentUser?.uid || null,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  });

  // Move SharePoint folder to DK Bas archive.
  if (!sourceSiteId || !sourcePath) {
    console.warn('[archiveCompanyProject] Missing SharePoint linkage, archived in Firestore only', {
      projectId: pid,
      sourceSiteId,
      sourcePath,
    });
    return { ok: true, archivedFirestoreOnly: true };
  }

  const systemSiteId = await getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: true });
  if (!systemSiteId) {
    console.warn('[archiveCompanyProject] No system site configured; archived in Firestore only', { projectId: pid });
    return { ok: true, archivedFirestoreOnly: true };
  }

  const archiveBasePath = 'Arkiv/Projekt';

  try {
    const { ensureDkBasStructure } = await import('../services/azure/fileService');
    await ensureDkBasStructure(systemSiteId);

    const { moveDriveItemAcrossSitesByPath } = await import('../services/azure/hierarchyService');
    await moveDriveItemAcrossSitesByPath({
      sourceSiteId,
      sourcePath,
      destSiteId: systemSiteId,
      destParentPath: archiveBasePath,
      destName: projectName,
    });

    return { ok: true };
  } catch (e) {
    console.warn('[archiveCompanyProject] SharePoint move failed; project remains archived in Firestore', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Realtime subscription to company projects.
 * Returns unsubscribe function.
 */
export function subscribeCompanyProjects(companyId, { siteRole = 'projects' } = {}, onNext, onError) {
  const cid = String(companyId || '').trim();
  if (!cid) {
    try { onNext?.([]); } catch (_e) {}
    return () => {};
  }

  const role = String(siteRole || '').trim().toLowerCase();
  const colRef = collection(db, 'foretag', cid, 'projects');

  // Keep subscription simple and robust: avoid composite indexes by filtering client-side.
  const q = query(colRef, orderBy('projectNumber', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const out = [];
      snap.forEach((docSnap) => {
        try {
          const d = docSnap.data() || {};
          if (role && String(d.siteRole || '').trim().toLowerCase() !== role) return;
          out.push({ id: docSnap.id, ...d });
        } catch (_e) {}
      });
      out.sort((a, b) => String(a?.projectNumber || '').localeCompare(String(b?.projectNumber || ''), undefined, { numeric: true, sensitivity: 'base' }));
      try { onNext?.(out); } catch (_e) {}
    },
    (err) => {
      try { onError?.(err); } catch (_e) {}
    }
  );
}

/**
 * Realtime subscription to a company's project organisation documents.
 * Collection: foretag/{companyId}/project_organisation
 *
 * Note: This intentionally subscribes to the full collection and lets callers
 * filter client-side (robust for legacy docs without dedicated index fields).
 */
export function subscribeCompanyProjectOrganisation(companyId, onNext, onError) {
  const cid = String(companyId || '').trim();
  if (!cid) {
    try { onNext?.([]); } catch (_e) {}
    return () => {};
  }

  const colRef = collection(db, 'foretag', cid, 'project_organisation');
  const q = query(colRef);
  return onSnapshot(
    q,
    (snap) => {
      const out = [];
      snap.forEach((docSnap) => {
        try {
          const d = docSnap.data() || {};
          out.push({ id: docSnap.id, ...d });
        } catch (_e) {}
      });
      try { onNext?.(out); } catch (_e) {}
    },
    (err) => {
      try { onError?.(err); } catch (_e) {}
    }
  );
}

/**
 * Save SharePoint navigation configuration for a company
 * @param {string} companyIdOverride - Optional explicit company ID
 * @param {Object} config - Navigation configuration
 * @returns {Promise<void>}
 */
export async function saveSharePointNavigationConfig(companyIdOverride, config) {
  const companyId = await resolveCompanyId(companyIdOverride, config || null);
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  try {
    const configRef = doc(db, 'foretag', companyId, 'sharepoint_navigation', 'config');
    await setDoc(configRef, {
      ...config,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
    
    console.log(`[saveSharePointNavigationConfig] ✅ Saved navigation config for ${companyId}`);
  } catch (error) {
    console.error('[saveSharePointNavigationConfig] Error:', error);
    throw error;
  }
}

/**
 * Get list of SharePoint sites available to the current user
 * Uses Microsoft Graph API to fetch sites the user has access to
 * @returns {Promise<Array>} Array of site objects { id, name, webUrl, displayName }
 */
export async function getAvailableSharePointSites() {
  try {
    // Dynamic import to avoid circular dependency
    const { getAccessToken } = await import('../services/azure/authService');
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to get access token. Please authenticate first.');
    }

    const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
    
    // Fetch sites the user follows or has access to
    // Using /me/followedSites and /sites/search to get all accessible sites
    const [followedResponse, searchResponse] = await Promise.allSettled([
      fetch(`${GRAPH_API_BASE}/me/followedSites`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${GRAPH_API_BASE}/sites?search=*`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
    ]);

    const siteMap = new Map();

    // Process followed sites
    if (followedResponse.status === 'fulfilled' && followedResponse.value.ok) {
      const followedData = await followedResponse.value.json();
      if (followedData.value && Array.isArray(followedData.value)) {
        followedData.value.forEach(site => {
          if (site.id && !siteMap.has(site.id)) {
            siteMap.set(site.id, {
              id: site.id,
              name: site.displayName || site.name || 'Unnamed Site',
              webUrl: site.webUrl || '',
              displayName: site.displayName || site.name || 'Unnamed Site',
            });
          }
        });
      }
    }

    // Process search results
    if (searchResponse.status === 'fulfilled' && searchResponse.value.ok) {
      const searchData = await searchResponse.value.json();
      if (searchData.value && Array.isArray(searchData.value)) {
        searchData.value.forEach(site => {
          if (site.id && !siteMap.has(site.id)) {
            siteMap.set(site.id, {
              id: site.id,
              name: site.displayName || site.name || 'Unnamed Site',
              webUrl: site.webUrl || '',
              displayName: site.displayName || site.name || 'Unnamed Site',
            });
          }
        });
      }
    }

    return Array.from(siteMap.values());
  } catch (error) {
    console.error('[getAvailableSharePointSites] Error:', error);
    throw error;
  }
}

/**
 * Fetch SharePoint site metadata for a company.
 * Stored in Firestore so Digitalkontroll can decide visibility independently from SharePoint.
 * Collection: foretag/{company}/sharepoint_sites/{siteId}
 * @returns {Promise<Array>} Array of meta objects
 */
export async function fetchCompanySharePointSiteMetas(companyId) {
  const cid = String(companyId || '').trim();
  if (!cid) return [];
  try {
    const colRef = collection(db, 'foretag', cid, 'sharepoint_sites');
    const snap = await getDocs(colRef);
    const out = [];
    snap.forEach((docSnap) => {
      try {
        const d = docSnap.data() || {};
        out.push({ id: docSnap.id, ...d });
      } catch (_e) {}
    });
    return out;
  } catch (error) {
    console.warn('[fetchCompanySharePointSiteMetas] Error:', error);
    return [];
  }
}

function normalizeSharePointSiteRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return null;
  if (r === 'projects' || r === 'project') return 'projects';
  if (r === 'project-root' || r === 'project_root' || r === 'projectroot') return 'projects';
  if (r === 'system' || r === 'system-site' || r === 'system_site') return 'system';
  if (r === 'system-base' || r === 'system_base' || r === 'systembase') return 'system';
  if (r === 'custom' || r === 'extra') return 'custom';
  return r;
}

function canBeVisibleInLeftPanelByRole(role) {
  const r = normalizeSharePointSiteRole(role);
  return r === 'projects' || r === 'custom';
}

/**
 * Resolve a company's SharePoint site id by role using Digitalkontroll metadata.
 * - role="projects" => DK Site (project-only)
 * - role="system"   => DK Bas (system-only)
 *
 * Best-effort: can trigger server-side sync to seed/backfill metadata.
 */
export async function getCompanySharePointSiteIdByRole(companyId, role, { syncIfMissing = true } = {}) {
  const cid = String(companyId || '').trim();
  const targetRole = normalizeSharePointSiteRole(role) || String(role || '').trim().toLowerCase();
  if (!cid || !targetRole) return null;

  const pick = (metas) => {
    const m = (metas || []).find((x) => x && normalizeSharePointSiteRole(x.role) === targetRole);
    const id = m ? String(m.siteId || m.id || '').trim() : '';
    return id || null;
  };

  let metas = await fetchCompanySharePointSiteMetas(cid);
  let siteId = pick(metas);
  if (siteId) return siteId;

  if (syncIfMissing) {
    try { await syncSharePointSiteVisibilityRemote({ companyId: cid }); } catch (_e) {}
    metas = await fetchCompanySharePointSiteMetas(cid);
    siteId = pick(metas);
    if (siteId) return siteId;
  }

  return null;
}

/**
 * Get visible SharePoint site IDs for a company.
 * Visibility is controlled by Firestore metadata (visibleInLeftPanel).
 */
export async function getCompanyVisibleSharePointSiteIds(companyId) {
  const metas = await fetchCompanySharePointSiteMetas(companyId);
  return (metas || [])
    .filter((m) => m && m.visibleInLeftPanel === true && canBeVisibleInLeftPanelByRole(m.role))
    .map((m) => String(m.siteId || m.id || '').trim())
    .filter(Boolean);
}

/**
 * Upsert (create/update) SharePoint site metadata for a company.
 * Doc id is the siteId.
 */
export async function upsertCompanySharePointSiteMeta(companyId, meta) {
  const cid = String(companyId || '').trim();
  const siteId = String(meta?.siteId || '').trim();
  if (!cid || !siteId) throw new Error('companyId and meta.siteId are required');

  const role = normalizeSharePointSiteRole(meta?.role) || 'system';
  const visibleInLeftPanel = canBeVisibleInLeftPanelByRole(role) && meta?.visibleInLeftPanel === true;

  const payload = {
    siteId,
    siteUrl: meta?.siteUrl ? String(meta.siteUrl) : (meta?.webUrl ? String(meta.webUrl) : null),
    siteName: meta?.siteName ? String(meta.siteName) : (meta?.name ? String(meta.name) : null),
    role,
    visibleInLeftPanel,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null,
  };

  const ref = doc(db, 'foretag', cid, 'sharepoint_sites', siteId);
  await setDoc(ref, sanitizeForFirestore(payload), { merge: true });
  return true;
}

/**
 * Server-side sync/migration: ensures sharepoint_sites metadata exists and is correct.
 * Uses Cloud Functions admin privileges to read system config and write metadata.
 */
export async function syncSharePointSiteVisibilityRemote({ companyId }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const cid = String(companyId || '').trim();
  if (!cid) throw new Error('companyId is required');
  const fn = httpsCallable(functionsClient, 'syncSharePointSiteVisibility');
  const res = await fn({ companyId: cid });
  return res && res.data ? res.data : res;
}

/**
 * Get all phase SharePoint configurations for a company
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} Map of phaseKey -> config
 */
export async function getAllPhaseSharePointConfigs(companyId) {
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  try {
    const phasesRef = collection(db, 'foretag', companyId, 'sharepoint_phases');
    const phasesSnap = await getDocs(phasesRef);
    
    const configs = {};
    phasesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.enabled) {
        configs[docSnap.id] = {
          phaseKey: docSnap.id,
          siteId: data.siteId,
          webUrl: data.webUrl || null,
          siteName: data.siteName || null,
          enabled: true,
          updatedAt: data.updatedAt,
        };
      }
    });
    
    return configs;
  } catch (error) {
    console.error('[getAllPhaseSharePointConfigs] Error:', error);
    return {};
  }
}
