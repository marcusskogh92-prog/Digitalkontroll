
// components/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

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
export const auth = getAuth(app);
export const db = getFirestore(app);

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
export async function saveControlToFirestore(control) {
  try {
    if (!control) return false;
    const id = control.id || (new Date().getTime().toString());
    const ref = doc(db, 'controls', id);
    const payload = { ...control, savedAt: serverTimestamp() };
    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (e) {
    return false;
  }
}

export async function saveDraftToFirestore(draft) {
  try {
    if (!draft) return false;
    const id = draft.id || (new Date().getTime().toString());
    const ref = doc(db, 'draft_controls', id);
    const payload = { ...draft, savedAt: serverTimestamp() };
    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (e) {
    return false;
  }
}
