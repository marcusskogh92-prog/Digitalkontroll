
// components/firebase.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, getDocsFromServer, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Alert, Platform } from 'react-native';

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
// Functions client
let _functionsClient = null;
try {
  _functionsClient = getFunctions(app);
} catch (_e) {
  _functionsClient = null;
}
export const functionsClient = _functionsClient;

// Emulator connection disabled - using production Firebase
// If running in a browser on localhost, connect the Functions client to the emulator
/*
try {
  if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
      if (functionsClient && typeof connectFunctionsEmulator === 'function') {
        // default emulator port used by firebase emulators: 5001
        connectFunctionsEmulator(functionsClient, 'localhost', 5001);
        console.log('[firebase] connected functions client to emulator at localhost:5001');
      }
    } catch (e) { console.warn('[firebase] could not connect functions emulator', e); }
  }
} catch(e) {}

// Also connect Firestore and Auth clients to local emulators when running on localhost
try {
  if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
      if (typeof connectFirestoreEmulator === 'function' && db) {
        // Firestore emulator in this project configured to 8085
        connectFirestoreEmulator(db, 'localhost', 8085);
        console.log('[firebase] connected firestore client to emulator at localhost:8085');
      }
    } catch (e) { console.warn('[firebase] could not connect firestore emulator', e); }
    try {
      if (typeof connectAuthEmulator === 'function' && auth) {
        // Auth emulator default port 9099
        try { connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true }); } catch(_e) { connectAuthEmulator(auth, 'http://localhost:9099'); }
        console.log('[firebase] connected auth client to emulator at http://localhost:9099');
      }
    } catch (e) { console.warn('[firebase] could not connect auth emulator', e); }
  }
} catch(e) {}
*/

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

export async function uploadUserAvatar({ companyId, uid, file }) {
  if (!companyId) throw new Error('companyId is required');
  if (!uid) throw new Error('uid is required');
  if (!file) throw new Error('file is required');
  const safeName = String(file?.name || 'avatar').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `user-avatars/${companyId}/${uid}/${Date.now()}_${safeName}`;
  const r = storageRef(storage, path);
  const contentType = String(file?.type || '').trim() || 'image/jpeg';
  await uploadBytes(r, file, { contentType });
  return await getDownloadURL(r);
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
  // Firestore rejects nested arrays (arrays that contain arrays anywhere inside them).
  // Strategy:
  // - Walk the value recursively.
  // - If an array is found that contains another array anywhere in its subtree,
  //   convert that array into an object keyed by index (so Firestore accepts it).
  // - Otherwise keep arrays as arrays but ensure their elements are sanitized.
  function containsArray(v) {
    if (!v) return false;
    if (Array.isArray(v)) return true;
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) if (containsArray(v[k])) return true;
    }
    return false;
  }

  function _walk(v) {
    if (Array.isArray(v)) {
      // If any element (recursively) contains an array, convert the whole array to an object
      // keyed by index to avoid nested arrays anywhere.
      const hasNested = v.some(el => containsArray(el));
      if (hasNested) {
        const obj = {};
        for (let i = 0; i < v.length; i++) obj[i] = _walk(v[i]);
        return obj;
      }
      // Safe to keep as array; sanitize elements.
      return v.map(el => _walk(el));
    }
    if (v && typeof v === 'object' && !(v instanceof Date)) {
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
  if (!companyId) return [];
  try {
    const ref = doc(db, 'foretag', companyId, 'hierarki', 'state');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return Array.isArray(data.items) ? data.items : [];
    }
  } catch(_e) {
    // Silent fail -> caller can fall back to local storage
  }
  return [];
}

export async function saveHierarchy(companyId, items) {
  if (!companyId) return false;
  try {
    const ref = doc(db, 'foretag', companyId, 'hierarki', 'state');
    // write items with server timestamp
    await setDoc(ref, { items, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch(_e) {
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
// Fields: { name, companyName, role, phone, email, createdAt, updatedAt, createdBy? }
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

export async function createCompanyContact({ name, companyName, role, phone, email }, companyIdOverride) {
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
    companyName: String(companyName || '').trim() || String(companyId || '').trim(),
    role: String(role || '').trim(),
    phone: String(phone || '').trim(),
    email: String(email || '').trim(),
    createdAt: serverTimestamp(),
  };
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
  if (Object.prototype.hasOwnProperty.call(safePatch, 'role')) {
    safePatch.role = String(safePatch.role || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'phone')) {
    safePatch.phone = String(safePatch.phone || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(safePatch, 'email')) {
    safePatch.email = String(safePatch.email || '').trim();
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

