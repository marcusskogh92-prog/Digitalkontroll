/**
 * Offertintag (Offerter) Service - kalkylskede
 *
 * Storage:
 * foretag/{companyId}/projects/{projectId}/phaseData/kalkylskede/offerPackages/{packageId}
 * foretag/{companyId}/projects/{projectId}/phaseData/kalkylskede/offerPackages/{packageId}/notes/{noteId}
 */

import {
    addDoc,
    collection,
    deleteDoc,
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

export const OFFER_PACKAGE_STATUSES = [
  'Ej skickad',
  'Skickad',
  'Mottagen',
  'Klar',
];

export function getOfferPackagesCollectionRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  const phaseDocRef = doc(db, 'foretag', cid, 'projects', pid, 'phaseData', 'kalkylskede');
  return collection(phaseDocRef, 'offerPackages');
}

export function getOfferPackageNotesCollectionRef(companyId, projectId, packageId) {
  const colRef = getOfferPackagesCollectionRef(companyId, projectId);
  const pkgId = String(packageId || '').trim();
  if (!pkgId) throw new Error('packageId is required');
  return collection(doc(colRef, pkgId), 'notes');
}

export function listenOfferPackages(companyId, projectId, onItems, onError, options) {
  const colRef = getOfferPackagesCollectionRef(companyId, projectId);
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
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

export async function createOfferPackage(companyId, projectId, data) {
  const colRef = getOfferPackagesCollectionRef(companyId, projectId);

  const user = auth?.currentUser || null;
  const createdByUid = user?.uid || null;
  const createdByName = String(user?.displayName || user?.email || '').trim() || null;

  const byggdelLabel = String(data?.byggdelLabel || data?.byggdel || '').trim();
  const supplierName = String(data?.supplierName || '').trim();
  const supplierId = String(data?.supplierId || '').trim() || null;

  if (!byggdelLabel) throw new Error('Byggdel är obligatoriskt');
  if (!supplierName && !supplierId) throw new Error('Leverantör är obligatoriskt');

  const statusCandidate = String(data?.status || 'Ej skickad').trim();
  const status = OFFER_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';

  const payload = {
    mode: String(data?.mode || 'manual').trim() || 'manual',

    byggdelLabel,
    byggdelGroup: String(data?.byggdelGroup || '').trim() || null,
    byggdelMoment: String(data?.byggdelMoment || '').trim() || null,

    supplierId,
    supplierName: supplierName || null,

    status,

    sharePointFolderPath: String(data?.sharePointFolderPath || '').trim() || null,

    deleted: false,

    createdAt: serverTimestamp(),
    createdByUid,
    createdByName,
    updatedAt: serverTimestamp(),
    updatedByUid: createdByUid,
    updatedByName: createdByName,
  };

  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function updateOfferPackage(companyId, projectId, packageId, patch) {
  const colRef = getOfferPackagesCollectionRef(companyId, projectId);
  const ref = doc(colRef, String(packageId || '').trim());

  const user = auth?.currentUser || null;

  const next = {
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: user?.uid || null,
    updatedByName: String(user?.displayName || user?.email || '').trim() || null,
  };

  if (Object.prototype.hasOwnProperty.call(next, 'status')) {
    const statusCandidate = String(next.status || '').trim();
    next.status = OFFER_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';
  }

  await updateDoc(ref, next);
  return true;
}

export async function deleteOfferPackage(companyId, projectId, packageId) {
  const colRef = getOfferPackagesCollectionRef(companyId, projectId);
  const ref = doc(colRef, String(packageId || '').trim());
  await deleteDoc(ref);
  return true;
}

export function listenOfferPackageNotes(companyId, projectId, packageId, onItems, onError) {
  const notesRef = getOfferPackageNotesCollectionRef(companyId, projectId, packageId);
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

export async function addOfferPackageNote(companyId, projectId, packageId, text) {
  const notesRef = getOfferPackageNotesCollectionRef(companyId, projectId, packageId);
  const t = String(text || '').trim();
  if (!t) throw new Error('Tom kommentar');

  const user = auth?.currentUser || null;
  const createdByUid = user?.uid || null;
  const createdByName = String(user?.displayName || user?.email || '').trim() || null;

  const payload = {
    text: t,
    createdAt: serverTimestamp(),
    createdByUid,
    createdByName,
  };

  const docRef = await addDoc(notesRef, payload);
  return docRef.id;
}
