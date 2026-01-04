
// components/firebase.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { Alert } from 'react-native';

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

// Initiera autentisering & Firestore
// Use React Native AsyncStorage for Auth persistence when possible
let _auth;
try {
  _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (e) {
  // Fallback to default (web) auth for environments where initializeAuth isn't available
  _auth = getAuth(app);
}
export const auth = _auth;
export const db = getFirestore(app);

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
      const tokenRes = await auth.currentUser.getIdTokenResult(false).catch(() => null);
      snap.claimsCompanyId = tokenRes?.claims?.companyId || null;
    }
  } catch (e) {}
  try {
    snap.storedCompanyId = await AsyncStorage.getItem('dk_companyId');
  } catch (e) {}
  return snap;
}

async function resolveCompanyId(preferredCompanyId, payload) {
  // Firestore rules are enforced using auth token claims.
  // To avoid permission-denied due to mismatched local/profile values,
  // always prefer the authenticated user's companyId claim when available.
  try {
    const user = auth && auth.currentUser;
    if (user && user.getIdTokenResult) {
      const tokenRes = await user.getIdTokenResult(false).catch(() => null);
      const claims = tokenRes && tokenRes.claims ? tokenRes.claims : {};
      if (claims && claims.companyId) return claims.companyId;
    }
  } catch (e) {}

  // Explicit override (only used when no claim is available)
  if (preferredCompanyId) return preferredCompanyId;

  // Payload-provided companyId (only used when no claim is available)
  if (payload && payload.companyId) return payload.companyId;
  try {
    const stored = await AsyncStorage.getItem('dk_companyId');
    if (stored) return stored;
  } catch (e) {}
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
  } catch (err) {
    console.warn('[firebase] sanitizeForFirestore failed, falling back to JSON stringify', err);
    // As a last resort, stringify the whole payload so setDoc won't throw nested-array errors.
    try {
      return { __json: JSON.stringify(value) };
    } catch (er) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {}
  return null;
}

export async function saveCompanyProfile(companyId, profile) {
  if (!companyId) return false;
  try {
    const ref = doc(db, 'foretag', companyId, 'profil', 'public');
    await setDoc(ref, profile, { merge: true });
    return true;
  } catch (e) {
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
  } catch (e) {}
  return null;
}

// Save or update a user's profile document (client-side safe helper)
export async function saveUserProfile(uid, data) {
  if (!uid) return false;
  try {
    const ref = doc(db, 'users', uid);
    await setDoc(ref, data, { merge: true });
    return true;
  } catch (e) {
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
  } catch (e) {
    return false;
  }
}

// Controls persistence helpers
export async function saveControlToFirestore(control, companyIdOverride) {
  async function attemptWrite({ forceTokenRefresh } = { forceTokenRefresh: false }) {
    if (!control) return { ok: false, err: null, permissionDenied: false };
    if (forceTokenRefresh) {
      try {
        if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
      } catch (e) {}
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
    } catch (e) {
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
    } catch (e) {
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
  } catch (e) {
      // If Firestore rejects due to permission issues, persist locally and show a friendly alert
      const isPermissionError = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      try {
        const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
        let arr = rawArr ? JSON.parse(rawArr) : [];
        const debug = await getAuthDebugSnapshot();
        let resolvedCompanyId = null;
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, control); } catch (er) {}
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
      } catch (er) {}

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
        } catch (er) {}

        // Show friendly user-facing message and warn in console (avoid raw console.error to reduce noisy UI logs)
        try {
          Alert.alert('Sparat lokalt', 'Kontrollen sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch (er) {}
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
      } catch (e) {}
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
    } catch (e) {
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
    } catch (e) {
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
  } catch (e) {
      const isPermissionError = (e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission'))));
      try {
        const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
        let arr = rawArr ? JSON.parse(rawArr) : [];
        const debug = await getAuthDebugSnapshot();
        let resolvedCompanyId = null;
        try { resolvedCompanyId = await resolveCompanyId(companyIdOverride, draft); } catch (er) {}
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
      } catch (er) {}

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
        } catch (er) {}

        try {
          Alert.alert('Sparat lokalt', 'Utkast sparades lokalt eftersom servern nekade skrivning. Appen kommer försöka synka senare.');
        } catch (er) {}
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
    } catch (e) {}

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
    } catch (e) {}

    return out;
  } catch (e) {
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
    } catch (e) {}

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
    } catch (e) {}

    return out;
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
    return false;
  }
}
