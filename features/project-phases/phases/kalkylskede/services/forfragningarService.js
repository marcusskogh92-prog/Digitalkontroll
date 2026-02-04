/**
 * Förfrågningar (Offerter) Service
 *
 * Storage:
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/byggdelar/{byggdelId}
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/paket/{paketId}
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/paket/{paketId}/notes/{noteId}
 */

import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';

import { auth, db } from '../../../../../components/firebase';

function requireIds(companyId, projectId) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return { cid, pid };
}

export const RFQ_PACKAGE_STATUSES = ['Ej skickad', 'Skickad', 'Besvarad'];

function nowUserMeta() {
  const user = auth?.currentUser || null;
  const uid = user?.uid || null;
  const name = String(user?.displayName || user?.email || '').trim() || null;
  return { uid, name };
}

export function getForfragningarDocRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  // Projects/{pid}/offerter/forfragningar is a doc (not a collection).
  return doc(db, 'foretag', cid, 'projects', pid, 'offerter', 'forfragningar');
}

export function getRfqByggdelarCollectionRef(companyId, projectId) {
  const ref = getForfragningarDocRef(companyId, projectId);
  return collection(ref, 'byggdelar');
}

export function getRfqPackagesCollectionRef(companyId, projectId) {
  const ref = getForfragningarDocRef(companyId, projectId);
  return collection(ref, 'paket');
}

export function getRfqPackageNotesCollectionRef(companyId, projectId, packageId) {
  const pkgId = String(packageId || '').trim();
  if (!pkgId) throw new Error('packageId is required');
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
  return collection(doc(colRef, pkgId), 'notes');
}

export function listenRfqByggdelar(companyId, projectId, onItems, onError, options) {
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
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

export function listenRfqPackages(companyId, projectId, onItems, onError, options) {
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
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

export async function createRfqByggdel(companyId, projectId, data) {
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const label = String(data?.label || data?.byggdelLabel || '').trim();
  if (!label) throw new Error('Byggdel är obligatoriskt');

  const { uid, name } = nowUserMeta();
  const payload = {
    label,
    code: String(data?.code || '').trim() || null,
    group: String(data?.group || '').trim() || null,
    moment: String(data?.moment || '').trim() || null,

    deleted: false,

    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function softDeleteRfqByggdel(companyId, projectId, byggdelId) {
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const bid = String(byggdelId || '').trim();
  if (!bid) throw new Error('byggdelId is required');

  const { uid, name } = nowUserMeta();
  await updateDoc(doc(colRef, bid), {
    deleted: true,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  });
  return true;
}

export async function createRfqPackage(companyId, projectId, data) {
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);

  const byggdelId = String(data?.byggdelId || '').trim();
  const byggdelLabel = String(data?.byggdelLabel || '').trim();
  const supplierId = String(data?.supplierId || '').trim() || null;
  const supplierName = String(data?.supplierName || '').trim();

  if (!byggdelId || !byggdelLabel) throw new Error('Byggdel är obligatoriskt');
  if (!supplierName && !supplierId) throw new Error('Leverantör är obligatoriskt');

  const statusCandidate = String(data?.status || 'Ej skickad').trim();
  const status = RFQ_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';

  const { uid, name } = nowUserMeta();
  const payload = {
    byggdelId,
    byggdelLabel,
    supplierId,
    supplierName: supplierName || null,

    status,

    sharePointFolderPath: String(data?.sharePointFolderPath || '').trim() || null,

    sentAt: null,
    answeredAt: null,

    deleted: false,

    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function updateRfqPackage(companyId, projectId, packageId, patch) {
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
  const pid = String(packageId || '').trim();
  if (!pid) throw new Error('packageId is required');

  const { uid, name } = nowUserMeta();
  const next = {
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  if (Object.prototype.hasOwnProperty.call(next, 'status')) {
    const statusCandidate = String(next.status || '').trim();
    next.status = RFQ_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';

    // Auto-stamp when reaching certain statuses.
    if (next.status === 'Skickad') {
      if (!Object.prototype.hasOwnProperty.call(next, 'sentAt')) next.sentAt = serverTimestamp();
    }
    if (next.status === 'Besvarad') {
      if (!Object.prototype.hasOwnProperty.call(next, 'answeredAt')) next.answeredAt = serverTimestamp();
    }
  }

  await updateDoc(doc(colRef, pid), next);
  return true;
}

export function listenRfqPackageNotes(companyId, projectId, packageId, onItems, onError) {
  const notesRef = getRfqPackageNotesCollectionRef(companyId, projectId, packageId);
  const q = query(notesRef, orderBy('createdAt', 'asc'));

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

export async function addRfqPackageNote(companyId, projectId, packageId, text) {
  const notesRef = getRfqPackageNotesCollectionRef(companyId, projectId, packageId);
  const t = String(text || '').trim();
  if (!t) throw new Error('Tom kommentar');

  const { uid, name } = nowUserMeta();
  const payload = {
    text: t,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
  };

  const docRef = await addDoc(notesRef, payload);
  return docRef.id;
}
