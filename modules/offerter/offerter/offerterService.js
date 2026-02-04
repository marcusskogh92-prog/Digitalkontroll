import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../../../components/firebase';

function requireIds(companyId, projectId) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return { cid, pid };
}

function nowUserMeta() {
  const user = auth?.currentUser || null;
  const uid = user?.uid || null;
  const name = String(user?.displayName || user?.email || '').trim() || null;
  return { uid, name };
}

export function getOfferterDocRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  // Projects/{pid}/offerter/offerter is a doc (not a collection).
  return doc(db, 'foretag', cid, 'projects', pid, 'offerter', 'offerter');
}

export function getOfferterPackagesCollectionRef(companyId, projectId) {
  const ref = getOfferterDocRef(companyId, projectId);
  return collection(ref, 'paket');
}

export function getOfferterPackageNotesCollectionRef(companyId, projectId, packageId) {
  const pkgId = String(packageId || '').trim();
  if (!pkgId) throw new Error('packageId is required');
  const colRef = getOfferterPackagesCollectionRef(companyId, projectId);
  return collection(doc(colRef, pkgId), 'notes');
}

export function listenOfferterPackages(companyId, projectId, onItems, onError, options) {
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
  const colRef = getOfferterPackagesCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      const visible = includeDeleted ? items : items.filter((it) => it?.deleted !== true);
      if (typeof onItems === 'function') onItems(visible);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export function listenOfferterPackageNotes(companyId, projectId, packageId, onItems, onError) {
  const colRef = getOfferterPackageNotesCollectionRef(companyId, projectId, packageId);
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      if (typeof onItems === 'function') onItems(items);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function addOfferterPackageNote(companyId, projectId, packageId, text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Text är obligatoriskt');
  const colRef = getOfferterPackageNotesCollectionRef(companyId, projectId, packageId);
  const { uid, name } = nowUserMeta();
  const payload = {
    text: t,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
  };
  await addDoc(colRef, payload);
}
