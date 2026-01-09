
// components/firebase.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getDocsFromServer, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
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
// Prefer web `getAuth` by default; attempt to enable React Native persistence
// only on native platforms via dynamic import to avoid bundling native-only
// exports into the web build (which causes compile errors).
let _auth = getAuth(app);
if (Platform && Platform.OS && Platform.OS !== 'web') {
  try {
    // Try synchronous require first (works in many native packagers).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rnAuth = require('firebase/auth');
      if (rnAuth && typeof rnAuth.initializeAuth === 'function' && typeof rnAuth.getReactNativePersistence === 'function') {
        _auth = rnAuth.initializeAuth(app, { persistence: rnAuth.getReactNativePersistence(AsyncStorage) });
      }
    } catch (reqErr) {
      // Fall back to dynamic import for environments that support it.
      (async () => {
        try {
          const rnAuth = await import('firebase/auth');
          if (rnAuth && typeof rnAuth.initializeAuth === 'function' && typeof rnAuth.getReactNativePersistence === 'function') {
            _auth = rnAuth.initializeAuth(app, { persistence: rnAuth.getReactNativePersistence(AsyncStorage) });
          }
        } catch (e) {
          // No-op: leave default web auth instance
        }
      })();
    }
  } catch (e) {
    // leave default web auth instance
  }
}
export const auth = _auth;
export const db = getFirestore(app);
// Functions client
let _functionsClient = null;
try {
  _functionsClient = getFunctions(app);
} catch (e) {
  _functionsClient = null;
}
export const functionsClient = _functionsClient;

// If running in a browser on localhost, connect the Functions client to the emulator
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
        try { connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true }); } catch(e) { connectAuthEmulator(auth, 'http://localhost:9099'); }
        console.log('[firebase] connected auth client to emulator at http://localhost:9099');
      }
    } catch (e) { console.warn('[firebase] could not connect auth emulator', e); }
  }
} catch(e) {}

// Callable wrappers
export async function createUserRemote({ companyId, email, displayName }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'createUser');
  const res = await fn({ companyId, email, displayName });
  return res && res.data ? res.data : res;
}

export async function deleteUserRemote({ companyId, uid }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'deleteUser');
  const res = await fn({ companyId, uid });
  return res && res.data ? res.data : res;
}

export async function updateUserRemote({ companyId, uid, displayName, email, role, password }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'updateUser');
  const payload = { companyId, uid };
  if (displayName !== undefined) payload.displayName = displayName;
  if (email !== undefined) payload.email = email;
  if (role !== undefined) payload.role = role;
  if (password !== undefined) payload.password = password;
  const res = await fn(payload);
  return res && res.data ? res.data : res;
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

export async function setSuperadminRemote({ email, uid }) {
  if (!functionsClient) throw new Error('Functions client not initialized');
  const fn = httpsCallable(functionsClient, 'setSuperadmin');
  const res = await fn({ email, uid });
  return res && res.data ? res.data : res;
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
  } catch(e) {}
  try {
    snap.storedCompanyId = await AsyncStorage.getItem('dk_companyId');
  } catch(e) {}
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
  } catch(e) {}

  try {
    const stored = await AsyncStorage.getItem('dk_companyId');
    if (stored) return stored;
  } catch(e) {}
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
    console.warn('[firebase] sanitizeForFirestore failed, falling back to JSON stringify', err);
    // As a last resort, stringify the whole payload so setDoc won't throw nested-array errors.
    try {
      return { __json: JSON.stringify(value) };
    } catch(e) {
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
  } catch(e) {
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
  } catch(e) {
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
  } catch(e) {}
  return null;
}

// Fetch a flat list of companies (foretag). Returns array of { id, profile }
export async function fetchCompanies() {
  try {
    const baseRef = collection(db, 'foretag');
    const snap = await getDocs(baseRef);
    const ids = [];
    snap.forEach(d => ids.push(d.id));
    // Fetch profiles in parallel
    const out = await Promise.all(ids.map(async (id) => {
      try {
        const pref = doc(db, 'foretag', id, 'profil', 'public');
        const ps = await getDoc(pref);
        return { id, profile: ps.exists() ? ps.data() : null };
      } catch(e) {
        return { id, profile: null };
      }
    }));
    // Sort by display name if available, otherwise by id
    out.sort((a, b) => {
      const an = String((a.profile && (a.profile.companyName || a.profile.name)) || a.id || '').toLowerCase();
      const bn = String((b.profile && (b.profile.companyName || b.profile.name)) || b.id || '').toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
    return out;
  } catch(e) {
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
          const st = b ? getStorage(app, `gs://${b}`) : storage;
          const r = storageRef(st, fullPath);
          const https = await getDownloadURL(r);
          if (https) return https;
        } catch (inner) {
          // fall through and try other bucket candidates
        }
      }

      return null;
    } catch(e) {
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
  } catch(e) {
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
  } catch(e) {}
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
  } catch(e) {
    return false;
  }
}

export async function fetchCompanyMembers(companyIdOverride, { role } = {}) {
  async function attemptRead({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(e) {}
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
      } catch(e) {
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
      } catch(e) {}

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
    } catch(e) {}

    return [];
  } catch(e) {
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
        try { if (typeof onData === 'function') onData([], { size: 0, fromCache: null, companyId: null }); } catch(e) {}
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
          } catch(e) {}
        },
        (err) => {
          try { if (typeof onError === 'function') onError(err); } catch(e) {}
        }
      );
    } catch(e) {
      try { if (typeof onError === 'function') onError(e); } catch(e) {}
    }
  })();

  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(e) {}
  };
}

// Save or update a user's profile document (client-side safe helper)
export async function saveUserProfile(uid, data) {
  if (!uid) return false;
  try {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, data, { merge: true });
    return true;
  } catch(e) {
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
  } catch(e) {
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
    } catch(e) {}
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
        try { if (typeof onData === 'function') onData([], { size: 0, fromCache: null, companyId: null }); } catch(e) {}
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
          } catch(e) {}
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
            } catch(e) {}
          })();
          try { if (typeof onError === 'function') onError(err); } catch(e) {}
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
        } catch(e) {}
      })();
      try { if (typeof onError === 'function') onError(e); } catch(e) {}
    }
  })();

  return () => {
    try { if (typeof unsub === 'function') unsub(); } catch(e) {}
  };
}

// Controls persistence helpers
export async function saveControlToFirestore(control, companyIdOverride) {
  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (!control) return { ok: false, err: null, permissionDenied: false };
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(e) {}
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
    } catch(e) {
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
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, control); } catch(e) {}
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
      } catch(e) {}

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
        } catch(e) {}

        // Show friendly user-facing message and warn in console (avoid raw console.error to reduce noisy UI logs)
        try {
          Alert.alert('Sparat lokalt', 'Kontrollen sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch(e) {}
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
      } catch(e) {}
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
    } catch(e) {
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
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, draft); } catch(e) {}
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
      } catch(e) {}

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
        } catch(e) {}

        try {
          Alert.alert('Sparat lokalt', 'Utkast sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch(e) {}
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
    } catch(e) {}

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
    } catch(e) {}

    return out;
  } catch(e) {
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
    } catch(e) {}

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
    } catch(e) {}

    return out;
  } catch(e) {
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
  } catch(e) {
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
  } catch(e) {
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
  } catch(e) {
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
  } catch(e) {
    return false;
  }
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
  } catch(e) {
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
    } catch(e) {
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
      } catch(e) {}
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
      } catch(e) {
        e = e2 || e;
      }
    }

    // Store debug info for troubleshooting (same pattern as other writes)
    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(e) {}
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
    } catch(e) {}

    throw e;
  }
}

export async function deleteByggdelMall({ mallId }, companyIdOverride) {
  async function attemptDelete({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch(e) {}
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
      } catch(e) {
        e = e2 || e;
      }
    }

    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(e) {}
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
    } catch(e) {}

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
      } catch(e) {}
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
      } catch(e) {
        e = e2 || e;
      }
    }

    try {
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      let arr = rawArr ? JSON.parse(rawArr) : [];
      const debug = await getAuthDebugSnapshot();
      let resolvedCompanyId = null;
      try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, null); } catch(e) {}
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
    } catch(e) {}

    throw e;
  }
}

